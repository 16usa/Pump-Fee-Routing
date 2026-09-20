import { createRequire } from 'node:module';
import { config } from './config.js';
import { upsertToken, upsertTokenChainState, finalizeChainDiscovery, recordClaim, db, setIndexerState } from './db.js';

const require=createRequire(import.meta.url);
let sdkCache;
async function sdk() {
  if (sdkCache) return sdkCache;
  // The Pump SDK's ESM bundle currently pulls a transitive package through an
  // incompatible named export under Node 24. Its supported CommonJS export is
  // functionally identical and avoids that loader failure.
  const pump = require('@pump-fun/pump-sdk');
  const web3 = require('@solana/web3.js');
  sdkCache={...pump,...web3}; return sdkCache;
}

function requireTreasury(){ if(!config.treasuryAddress) throw new Error('TREASURY_ADDRESS is not configured'); }
const now=()=>new Date().toISOString();
const logMint=(level,mint,message,extra={})=>console[level](`[solana] mint=${mint} ${message}`,extra);
function rejectMint(mint,reason,details={}){
  logMint('warn',mint,`rejected reason=${reason}`,details);
  return {ok:false,mint,reason,...details};
}
function normalizeHandle(value=''){
  const raw=String(value||'').trim();
  const direct=raw.match(/^@?([A-Za-z0-9_]{1,15})$/);
  if(direct)return direct[1];
  const url=raw.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i);
  return url?.[1] || '';
}
export function parseRecipient(description='', fallback='') {
  const exact = description.match(/Fees\s+to\s+@([A-Za-z0-9_]{1,15})\b/i);
  if (exact) return {handle:exact[1],source:'fees-line'};
  const first = description.match(/@([A-Za-z0-9_]{1,15})/);
  if (first) return {handle:first[1],source:'first-handle'};
  const linked=normalizeHandle(fallback);
  if (linked) return {handle:linked,source:'linked-social'};
  return null;
}
async function fetchMetadata(mint) {
  const primary=config.pumpMetadataUrlTemplate.replace('{mint}',encodeURIComponent(mint));
  const urls=[...new Set([primary,`https://frontend-api-v3.pump.fun/coins-v2/${encodeURIComponent(mint)}`,`https://frontend-api-v3.pump.fun/coins/${encodeURIComponent(mint)}`])];
  let lastError='';
  for(const url of urls){
    try{
      const r=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});
      if(!r.ok){lastError=`HTTP ${r.status}`;continue;}
      const data=await r.json();
      if(data && typeof data==='object')return data;
      lastError='empty response';
    }catch(e){lastError=e.message;}
  }
  throw new Error(`Pump metadata unavailable: ${lastError||'unknown error'}`);
}

async function fetchSharingConfigNullable(connection,mintPk,PUMP_SDK,feeSharingConfigPda){
  const address=feeSharingConfigPda(mintPk);
  const account=await connection.getAccountInfo(address,'confirmed');
  return {address,sharing:account ? PUMP_SDK.decodeSharingConfig(account) : null};
}

export async function verifyAndRegisterMint(mint,{fallbackHandle='',connection:providedConnection=null,sharing:providedSharing=null,sharingAddress:providedAddress=null,verifiedSlot:providedSlot=null,solUsd:providedSolUsd=null}={}) {
  requireTreasury();
  const {Connection,PublicKey,OnlinePumpSdk,feeSharingConfigPda}=await sdk();
  let pk;
  try{ pk=new PublicKey(mint); }catch{return rejectMint(mint,'invalid-mint-address');}
  const connection=providedConnection || new Connection(config.solanaRpcUrl,'confirmed');
  const online=new OnlinePumpSdk(connection);
  let sharing=providedSharing, cfgAddress=providedAddress;
  if(!sharing){
    try{
      const fetched=await fetchSharingConfigNullable(connection,pk,(await sdk()).PUMP_SDK,feeSharingConfigPda);
      sharing=fetched.sharing; cfgAddress=fetched.address;
    }catch(e){
      console.error(`[solana] RPC sharing-config read failed mint=${mint}: ${e.message}`);
      throw new Error(`Solana RPC failed while reading sharing config for ${mint}: ${e.message}`);
    }
  }
  if(!sharing) return rejectMint(mint,'no-sharing-config');
  const treasury=new PublicKey(config.treasuryAddress);
  const shareholders=(sharing.shareholders||[]).map(s=>({address:s.address.toBase58(),shareBps:Number(s.shareBps)}));
  const exact100=shareholders.length===1 && shareholders[0].address===treasury.toBase58() && shareholders[0].shareBps===10000;
  if(!exact100) return rejectMint(mint,'treasury-not-100-percent',{shareholders});
  if(!sharing.adminRevoked) return rejectMint(mint,'sharing-config-not-permanent',{shareholders});
  const expectedCfg=feeSharingConfigPda(pk);
  const cfg=cfgAddress?.toBase58?.() || cfgAddress || expectedCfg.toBase58();
  if(cfg!==expectedCfg.toBase58()) return rejectMint(mint,'unexpected-sharing-config-address',{feeConfig:cfg});
  const existing=db.prepare('SELECT * FROM tokens WHERE mint=?').get(mint);
  let meta, metadataStale=false;
  try{ meta=await fetchMetadata(mint); }
  catch(e){
    if(!existing) return rejectMint(mint,'metadata-unavailable',{error:e.message});
    try{meta=JSON.parse(existing.metadata_json||'{}');metadataStale=true;}
    catch{return rejectMint(mint,'metadata-unavailable',{error:e.message});}
    logMint('warn',mint,'using last successfully indexed metadata',{error:e.message});
  }
  const name=String(meta.name||'').trim(), symbol=String(meta.symbol||'').trim();
  if((!name||!symbol) && !existing) return rejectMint(mint,'metadata-missing-name-or-symbol');
  const description=meta.description||meta.metadata?.description||'';
  const recipient=parseRecipient(description, fallbackHandle || meta.twitter || meta.x || '');
  if(!recipient && !existing) return rejectMint(mint,'recipient-not-found');
  const handle=recipient?.handle || existing.recipient_handle;
  const recipientSource=recipient?.source || existing.recipient_source;
  const marketCap=Number(meta.usd_market_cap ?? meta.market_cap);
  if(!Number.isFinite(marketCap) && !existing) return rejectMint(mint,'metadata-missing-usd-market-cap');
  let minimum, slot, solPrice;
  try{
    [minimum,slot,solPrice]=await Promise.all([
      online.getMinimumDistributableFee(pk),
      providedSlot == null ? connection.getSlot('confirmed') : Promise.resolve(providedSlot),
      providedSolUsd == null ? fetchSolUsd() : Promise.resolve(providedSolUsd)
    ]);
  }catch(e){
    console.error(`[solana] RPC fee snapshot failed mint=${mint}: ${e.message}`);
    throw new Error(`Solana RPC failed while reading creator fees for ${mint}: ${e.message}`);
  }
  const distributableLamports=Number(minimum.distributableFees?.toString?.()||0);
  const minimumLamports=Number(minimum.minimumRequired?.toString?.()||0);
  if(!Number.isSafeInteger(distributableLamports)||!Number.isSafeInteger(minimumLamports)) throw new Error(`Creator-fee balance exceeds safe integer range for ${mint}`);
  const grossUnclaimedUsd=(distributableLamports/1e9)*solPrice;
  upsertToken({
    mint,venue:'pump',name:name||existing.name,symbol:symbol||existing.symbol,image_url:meta.image_uri||meta.image||meta.image_url||meta.metadata?.image_uri||meta.metadata?.image||meta.metadata?.image_url||meta.coin_metadata?.image_uri||meta.coin_metadata?.image||meta.coin_metadata?.image_url||existing?.image_url||'',
    description:description||existing?.description||'',recipient_handle:handle,recipient_source:recipientSource,
    market_cap_usd:Number.isFinite(marketCap)?marketCap:Number(existing.market_cap_usd),
    fee_share_bps:10000,permanent:true,hidden:false,fee_config_address:cfg,
    created_at:meta.created_timestamp?new Date(Number(meta.created_timestamp)<1e12?Number(meta.created_timestamp)*1000:Number(meta.created_timestamp)).toISOString():existing?.created_at||null,metadata:meta
  });
  upsertTokenChainState({
    mint,sharing_config_address:cfg,verified_slot:slot,admin_revoked:true,sole_treasury:true,fee_share_bps:10000,
    distributable_lamports:distributableLamports,minimum_required_lamports:minimumLamports,
    can_distribute:!!minimum.canDistribute,is_graduated:!!minimum.isGraduated,sol_usd:solPrice,
    gross_unclaimed_usd:grossUnclaimedUsd,
    recipient_unclaimed_usd:grossUnclaimedUsd*config.recipientShareBps/10000,
    protocol_unclaimed_usd:grossUnclaimedUsd*config.protocolShareBps/10000,
    shareholders,active:true
  });
  logMint('info',mint,'indexed',{recipient:handle,slot,distributableLamports,canDistribute:!!minimum.canDistribute,metadataStale});
  return {ok:true,mint,recipient:handle,feeConfig:cfg,verifiedSlot:slot,distributableLamports,minimumRequiredLamports:minimumLamports,canDistribute:!!minimum.canDistribute,isGraduated:!!minimum.isGraduated,solUsd:solPrice,metadataStale};
}

export async function discoverOnChain({maxAccounts=5000}={}) {
  requireTreasury();
  const {Connection,PUMP_SDK,PUMP_FEE_PROGRAM_ID}=await sdk();
  const connection=new Connection(config.solanaRpcUrl,'confirmed');
  const started=now();
  setIndexerState('discovery_status','running');
  setIndexerState('discovery_started_at',started);
  setIndexerState('discovery_error','');
  console.log(`[discovery] start treasury=${config.treasuryAddress.slice(0,4)}…${config.treasuryAddress.slice(-4)} mode=read-only`);
  try{
    // In the Anchor layout the first shareholder address starts at byte 80.
    // Filtering server-side avoids downloading the entire Pump Fees program,
    // which is too large for this process and unnecessary for one treasury.
    const [accounts,slot]=await Promise.all([
      connection.getProgramAccounts(PUMP_FEE_PROGRAM_ID,{commitment:'confirmed',filters:[
        {memcmp:{offset:0,bytes:'dBH23jPD3C6'}},
        {memcmp:{offset:75,bytes:'2'}},
        {memcmp:{offset:76,bytes:'2UzHM'}},
        {memcmp:{offset:80,bytes:config.treasuryAddress}},
        {memcmp:{offset:112,bytes:'2EJ'}}
      ]}),
      connection.getSlot('confirmed')
    ]);
    if(accounts.length>maxAccounts) throw new Error(`Discovery returned ${accounts.length} accounts, above safety limit ${maxAccounts}; refusing a partial index`);
    const solUsd=accounts.length ? await fetchSolUsd() : null;
    let checked=0,matched=0,indexed=0,rejected=0,tokenErrors=0,decodeErrors=0;
    const seenOnChain=[];
    for(const item of accounts){
      checked++;
      try{
        const cfg=PUMP_SDK.decodeSharingConfig(item.account);
        const mint=cfg.mint.toBase58();
        const shareholders=(cfg.shareholders||[]).map(s=>({address:s.address.toBase58(),shareBps:Number(s.shareBps)}));
        const exact=cfg.adminRevoked && shareholders.length===1 && shareholders[0].address===config.treasuryAddress && shareholders[0].shareBps===10000;
        if(!exact){rejected++;logMint('warn',mint,'discovery candidate failed strict treasury/permanence verification',{shareholders,adminRevoked:!!cfg.adminRevoked});continue;}
        matched++;
        try{
          const res=await verifyAndRegisterMint(mint,{connection,sharing:cfg,sharingAddress:item.pubkey,verifiedSlot:slot,solUsd});
          if(res.ok){indexed++;seenOnChain.push(mint);}else rejected++;
        }catch(e){tokenErrors++;logMint('error',mint,'indexing failed',{error:e.message});}
      }catch(e){decodeErrors++;console.warn(`[discovery] invalid sharing-config account=${item.pubkey.toBase58()} error=${e.message}`);}
    }
    finalizeChainDiscovery([...new Set(seenOnChain)]);
    const completed=now();
    const result={mode:'read-only',checked,matched,indexed,rejected,tokenErrors,decodeErrors,slot,totalAccounts:accounts.length,completedAt:completed};
    for(const [key,value] of Object.entries({status:'ok',completed_at:completed,error:'',checked,matched,indexed,rejected,token_errors:tokenErrors,slot})){
      setIndexerState(`discovery_${key}`,value);
    }
    console.log('[discovery] complete',result);
    return result;
  }catch(e){
    setIndexerState('discovery_status','error');
    setIndexerState('discovery_completed_at',now());
    setIndexerState('discovery_error',e.message);
    console.error(`[discovery] RPC/index failure: ${e.message}`);
    throw e;
  }
}

function parseSecretKey(json){ const arr=JSON.parse(json); if(!Array.isArray(arr)||arr.length<32) throw new Error('CRANK_SECRET_KEY_JSON must be a JSON byte array'); return Uint8Array.from(arr); }
export async function claimMint(mint) {
  if(config.readOnlyMode) throw new Error('Read-only mode: claims are disabled');
  requireTreasury();
  const {Connection,PublicKey,Keypair,TransactionMessage,VersionedTransaction,OnlinePumpSdk}=await sdk();
  const connection=new Connection(config.solanaRpcUrl,'confirmed'); const online=new OnlinePumpSdk(connection); const mintPk=new PublicKey(mint);
  const min=await online.getMinimumDistributableFee(mintPk);
  const distributable=Number(min.distributableFees?.toString?.()||0);
  if(!min.canDistribute) return {ok:true,submitted:false,reason:'below-minimum',distributableLamports:distributable};
  const {instructions,isGraduated}=await online.buildDistributeCreatorFeesInstructions(mintPk);
  if(!config.liveChainTransactions) return {ok:true,submitted:false,dryRun:true,isGraduated,instructionCount:instructions.length,distributableLamports:distributable};
  if(!config.crankSecretKeyJson) throw new Error('CRANK_SECRET_KEY_JSON required when LIVE_CHAIN_TRANSACTIONS=true');
  const crank=Keypair.fromSecretKey(parseSecretKey(config.crankSecretKeyJson));
  const before=await connection.getBalance(new PublicKey(config.treasuryAddress),'confirmed');
  const latest=await connection.getLatestBlockhash('confirmed');
  const msg=new TransactionMessage({payerKey:crank.publicKey,recentBlockhash:latest.blockhash,instructions}).compileToV0Message();
  const tx=new VersionedTransaction(msg); tx.sign([crank]);
  const signature=await connection.sendTransaction(tx,{maxRetries:3,skipPreflight:false});
  await connection.confirmTransaction({signature,...latest},'confirmed');
  const parsed=await connection.getTransaction(signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
  let grossLamports=0;
  if(parsed?.transaction?.message?.staticAccountKeys){
    const idx=parsed.transaction.message.staticAccountKeys.findIndex(k=>k.toBase58()===config.treasuryAddress);
    if(idx>=0) grossLamports=(parsed.meta?.postBalances?.[idx]||0)-(parsed.meta?.preBalances?.[idx]||0);
  }
  if(grossLamports<=0){ const after=await connection.getBalance(new PublicKey(config.treasuryAddress),'confirmed'); grossLamports=Math.max(0,after-before); }
  const solPrice=await fetchSolUsd();
  const claim=recordClaim({mint,txSignature:signature,grossNative:grossLamports/1e9,nativeUsdPrice:solPrice,raw:{isGraduated,distributableLamports:distributable}});
  db.prepare(`UPDATE token_chain_state SET distributable_lamports=0,gross_unclaimed_usd=0,recipient_unclaimed_usd=0,protocol_unclaimed_usd=0,can_distribute=0,indexed_at=CURRENT_TIMESTAMP WHERE mint=?`).run(mint);
  return {ok:true,submitted:true,signature,grossLamports,solPrice,claim};
}

export async function fetchSolUsd(){
  try{ const r=await fetch('https://api.kraken.com/0/public/Ticker?pair=SOLUSD',{signal:AbortSignal.timeout(10000)}); const j=await r.json(); const row=Object.values(j.result||{})[0]; const p=Number(row?.c?.[0]); if(p>0){setIndexerState('last_sol_usd',p);return p;} }catch(e){console.warn(`[pricing] Kraken public SOL/USD read failed: ${e.message}`);}
  const v=Number(db.prepare(`SELECT value FROM indexer_state WHERE key='last_sol_usd'`).get()?.value||0); if(v>0)return v;
  throw new Error('Unable to fetch SOL/USD price');
}


export async function buildPumpCreateTransaction({mint,user,name,symbol,uri}) {
  if(!config.userSignedLaunchEnabled) throw new Error('User-signed launch is disabled');
  const cleanName=String(name||'').trim(), cleanSymbol=String(symbol||'').trim(), cleanUri=String(uri||'').trim();
  if(!cleanName || cleanName.length>32) throw new Error('Token name must be 1-32 characters');
  if(!cleanSymbol || cleanSymbol.length>13) throw new Error('Ticker must be 1-13 characters');
  if(!cleanUri || cleanUri.length>200) throw new Error('Metadata URI must be 1-200 characters');
  const {Connection,PublicKey,TransactionMessage,VersionedTransaction,PUMP_SDK}=await sdk();
  const connection=new Connection(config.solanaRpcUrl,'confirmed');
  const mintPk=new PublicKey(mint), userPk=new PublicKey(user);
  const ix=await PUMP_SDK.createV2Instruction({
    mint:mintPk,
    name:cleanName,
    symbol:cleanSymbol,
    uri:cleanUri,
    creator:userPk,
    user:userPk,
    mayhemMode:false,
    holderReward:false
  });
  const latest=await connection.getLatestBlockhash('confirmed');
  const msg=new TransactionMessage({
    payerKey:userPk,
    recentBlockhash:latest.blockhash,
    instructions:[ix]
  }).compileToV0Message();
  const tx=new VersionedTransaction(msg);
  return {
    transactionBase64:Buffer.from(tx.serialize()).toString('base64'),
    blockhash:latest.blockhash,
    lastValidBlockHeight:latest.lastValidBlockHeight,
    mint:mintPk.toBase58(),
    requiresMintSignature:true,
    mode:'create-only'
  };
}

export async function confirmUserSignedTransaction({signature,mint}) {
  if(!signature) throw new Error('Transaction signature required');
  const {Connection,PublicKey}=await sdk();
  const connection=new Connection(config.solanaRpcUrl,'confirmed');
  const mintPk=new PublicKey(mint);
  let confirmed=false, lastStatus=null;
  for(let i=0;i<30;i++){
    const out=await connection.getSignatureStatuses([String(signature)],{searchTransactionHistory:true});
    const status=out?.value?.[0]||null;
    lastStatus=status;
    if(status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    if(status && (status.confirmationStatus==='confirmed'||status.confirmationStatus==='finalized')){
      confirmed=true;
      break;
    }
    await new Promise(r=>setTimeout(r,750));
  }
  if(!confirmed) throw new Error('Transaction is not confirmed yet. Retry in a few seconds.');
  const mintAccount=await connection.getAccountInfo(mintPk,'confirmed');
  if(!mintAccount) throw new Error('Mint account is not visible on-chain after confirmation');
  return {
    ok:true,
    signature:String(signature),
    mint:mintPk.toBase58(),
    mintOwner:mintAccount.owner.toBase58(),
    confirmationStatus:lastStatus?.confirmationStatus||'confirmed'
  };
}

export async function buildFeeRoutingTransaction({mint,creator}) {
  if(!config.userSignedLaunchEnabled) throw new Error('User-signed launch routing is disabled');
  requireTreasury();
  const {Connection,PublicKey,TransactionMessage,VersionedTransaction,PUMP_SDK,OnlinePumpSdk,canonicalPumpPoolPda}=await sdk();
  const connection=new Connection(config.solanaRpcUrl,'confirmed'); const online=new OnlinePumpSdk(connection);
  const mintPk=new PublicKey(mint), creatorPk=new PublicKey(creator), treasury=new PublicKey(config.treasuryAddress);
  const existing=(await fetchSharingConfigNullable(connection,mintPk,PUMP_SDK,(await sdk()).feeSharingConfigPda)).sharing;
  if(existing?.adminRevoked) throw new Error('Sharing config is already permanent');
  const curve=await online.fetchBondingCurve(mintPk);
  const pool=curve.complete ? canonicalPumpPoolPda(mintPk) : null;
  const ixs=[];
  if(!existing) ixs.push(await PUMP_SDK.createFeeSharingConfig({creator:creatorPk,mint:mintPk,pool}));
  const current=(existing?.shareholders||[]).map(s=>s.address);
  const update = PUMP_SDK.updateFeeSharesV2
    ? await PUMP_SDK.updateFeeSharesV2({authority:creatorPk,mint:mintPk,currentShareholders:current.length?current:[creatorPk],newShareholders:[{address:treasury,shareBps:10000}],quoteMint:(await import('@solana/spl-token')).NATIVE_MINT,quoteTokenProgram:(await import('@solana/spl-token')).TOKEN_PROGRAM_ID})
    : await PUMP_SDK.updateFeeShares({authority:creatorPk,mint:mintPk,currentShareholders:current,newShareholders:[{address:treasury,shareBps:10000}]});
  ixs.push(update);
  if(!PUMP_SDK.updateFeeSharesV2 && PUMP_SDK.revokeFeeSharingAuthorityInstruction) ixs.push(await PUMP_SDK.revokeFeeSharingAuthorityInstruction({authority:creatorPk,mint:mintPk}));
  const latest=await connection.getLatestBlockhash('confirmed');
  const msg=new TransactionMessage({payerKey:creatorPk,recentBlockhash:latest.blockhash,instructions:ixs}).compileToV0Message();
  const tx=new VersionedTransaction(msg);
  return {transactionBase64:Buffer.from(tx.serialize()).toString('base64'),blockhash:latest.blockhash,lastValidBlockHeight:latest.lastValidBlockHeight,instructionCount:ixs.length};
}
