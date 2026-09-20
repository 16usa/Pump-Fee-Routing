import { randomUUID, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { db, recordClaim, getIndexerStatus } from './db.js';
import { homeData, listTokens, getToken, moneySummary, profile, listPayments } from './queries.js';
import { verifyAndRegisterMint, buildFeeRoutingTransaction, buildPumpCreateTransaction, confirmUserSignedTransaction, parseRecipient, fetchSolUsd } from './solana.js';
import { runDiscovery, runClaims, runPayouts } from './workers.js';
import { confirmPayout, optOutHandle } from './payouts.js';
import { sellSolUsd } from './kraken.js';
import { startXOAuth, finishXOAuth } from './xoauth.js';

function json(res,status,body){ const data=JSON.stringify(body); res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(data); }
async function body(req,maxBytes=1_000_000){ const chunks=[]; let size=0; for await(const c of req){ size+=c.length; if(size>maxBytes)throw Object.assign(new Error('Body too large'),{statusCode:413}); chunks.push(c); } if(!chunks.length)return {}; const text=Buffer.concat(chunks).toString('utf8'); try{return JSON.parse(text);}catch{throw Object.assign(new Error('Invalid JSON'),{statusCode:400});} }
function secureEq(a,b){ const aa=Buffer.from(a||''),bb=Buffer.from(b||''); return aa.length===bb.length && aa.length>0 && timingSafeEqual(aa,bb); }
function requireAdmin(req){ const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'') || req.headers['x-admin-token']; if(!config.adminToken||!secureEq(token,config.adminToken))throw Object.assign(new Error('Unauthorized'),{statusCode:401}); }
function requireWebhook(req){ const token=req.headers['x-webhook-secret'] || (req.headers.authorization||'').replace(/^Bearer\s+/i,''); if(!config.webhookSecret||!secureEq(token,config.webhookSecret))throw Object.assign(new Error('Unauthorized'),{statusCode:401}); }
function requireWritable(){ if(config.readOnlyMode)throw Object.assign(new Error('Read-only mode: money-moving and accounting mutation routes are disabled'),{statusCode:423}); }
function requireUserSignedLaunch(){ if(!config.userSignedLaunchEnabled)throw Object.assign(new Error('User-signed launch is disabled'),{statusCode:423}); }

export async function handleApi(req,res,url){
  try{
    if(req.method==='GET'&&url.pathname==='/api/health') return json(res,200,{ok:true,name:config.appName,treasuryConfigured:!!config.treasuryAddress,readOnly:config.readOnlyMode,liveChain:config.liveChainTransactions,userSignedLaunch:config.userSignedLaunchEnabled,onchainDiscovery:config.onchainDiscoveryEnabled,claimWorker:!config.readOnlyMode&&config.claimWorkerEnabled&&config.liveChainTransactions,payoutWorker:!config.readOnlyMode&&config.payoutWorkerEnabled,payoutProvider:config.payoutProvider,exchangeProvider:config.exchangeProvider,indexer:getIndexerStatus()});
    if(req.method==='GET'&&url.pathname==='/api/indexer/status') return json(res,200,getIndexerStatus());
    if(req.method==='GET'&&url.pathname==='/api/config') return json(res,200,{name:config.appName,mark:config.appMark,treasuryAddress:config.treasuryAddress,recipientShareBps:config.recipientShareBps,protocolShareBps:config.protocolShareBps,readOnly:config.readOnlyMode,liveChain:config.liveChainTransactions,userSignedLaunch:config.userSignedLaunchEnabled,payoutProvider:config.payoutProvider});
    if(req.method==='GET'&&url.pathname==='/api/home') return json(res,200,homeData());
    if(req.method==='GET'&&url.pathname==='/api/tokens') return json(res,200,{tokens:listTokens({search:url.searchParams.get('search')||'',sort:url.searchParams.get('sort')||'sent',venue:url.searchParams.get('venue')||'',limit:url.searchParams.get('limit')||100})});
    if(req.method==='GET'&&url.pathname.startsWith('/api/tokens/')){ const row=getToken(decodeURIComponent(url.pathname.slice('/api/tokens/'.length))); return row?json(res,200,row):json(res,404,{error:'Not found'}); }
    if(req.method==='GET'&&url.pathname.startsWith('/api/profiles/')){ const row=profile(decodeURIComponent(url.pathname.slice('/api/profiles/'.length))); return row?json(res,200,row):json(res,404,{error:'Not found'}); }
    if(req.method==='GET'&&url.pathname==='/api/money') return json(res,200,moneySummary());
    if(req.method==='GET'&&url.pathname==='/api/payments') return json(res,200,{payments:listPayments(Number(url.searchParams.get('limit')||50))});
    if(req.method==='GET'&&url.pathname==='/api/x/profile'){
      const username=String(url.searchParams.get('username')||'').replace(/^@/,'').trim();
      if(!/^[A-Za-z0-9_]{1,15}$/.test(username))throw Object.assign(new Error('Invalid X username'),{statusCode:400});
      if(!config.xBearerToken)throw Object.assign(new Error('X lookup is not configured'),{statusCode:503});
      const fields='id,name,username,profile_image_url,verified,verified_type';
      const r=await fetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=${encodeURIComponent(fields)}`,{
        headers:{authorization:`Bearer ${config.xBearerToken}`,accept:'application/json'},
        signal:AbortSignal.timeout(12000)
      });
      const payload=await r.json().catch(()=>({}));
      if(r.status===404 || (!payload.data && Array.isArray(payload.errors) && payload.errors.some(x=>x?.status===404))){
        return json(res,404,{error:'X account not found'});
      }
      if(!r.ok || !payload.data){
        const message=payload?.detail||payload?.title||payload?.errors?.[0]?.detail||payload?.errors?.[0]?.message||`X API HTTP ${r.status}`;
        throw Object.assign(new Error(message),{statusCode:r.status===429?429:502});
      }
      const u=payload.data;
      return json(res,200,{
        id:String(u.id||''),
        name:String(u.name||u.username||''),
        username:String(u.username||username),
        profileImageUrl:String(u.profile_image_url||''),
        verified:Boolean(u.verified),
        verifiedType:String(u.verified_type||'')
      });
    }
    if(req.method==='POST'&&url.pathname==='/api/tokens/register'){ const b=await body(req); const out=await verifyAndRegisterMint(b.mint,{fallbackHandle:b.recipient_handle||''}); return json(res,out.ok?200:422,out); }
    if(req.method==='POST'&&url.pathname==='/api/launch/intents'){ const b=await body(req); const handle=String(b.recipient_handle||'').replace(/^@/,'').trim(); if(!/^[A-Za-z0-9_]{1,15}$/.test(handle))throw Object.assign(new Error('Invalid X handle'),{statusCode:400}); const opted=db.prepare('SELECT opted_out FROM recipients WHERE handle=? COLLATE NOCASE').get(handle); if(opted?.opted_out)throw Object.assign(new Error('Recipient has opted out'),{statusCode:409}); const id=randomUUID(); const line=`Fees to @${handle} via ${config.appName}`; db.prepare(`INSERT INTO launch_intents(id,mint,recipient_handle,creator_pubkey,description_line,status) VALUES(?,?,?,?,?,'draft')`).run(id,b.mint||null,handle,b.creator_pubkey||null,line); return json(res,201,{id,descriptionLine:line,treasuryAddress:config.treasuryAddress,status:'draft'}); }
    if(req.method==='POST'&&url.pathname==='/api/launch/metadata'){
      requireUserSignedLaunch();
      const b=await body(req,7_000_000);
      const intent=db.prepare('SELECT * FROM launch_intents WHERE id=?').get(b.intent_id||'');
      if(!intent)throw Object.assign(new Error('Launch intent not found'),{statusCode:404});
      const name=String(b.name||'').trim(),symbol=String(b.symbol||'').trim().toUpperCase();
      if(!name||name.length>32)throw Object.assign(new Error('Token name must be 1-32 characters'),{statusCode:400});
      if(!symbol||symbol.length>13)throw Object.assign(new Error('Ticker must be 1-13 characters'),{statusCode:400});
      const type=String(b.image_type||'').toLowerCase();
      if(!/^image\/(png|jpeg|gif|webp)$/.test(type))throw Object.assign(new Error('Unsupported token image type'),{statusCode:400});
      let image;
      try{image=Buffer.from(String(b.image_base64||''),'base64');}catch{throw Object.assign(new Error('Invalid token image'),{statusCode:400});}
      if(!image.length||image.length>5_000_000)throw Object.assign(new Error('Token image must be 1 byte to 5 MB'),{statusCode:400});
      let description=String(b.description||'').trim();
      if(!description.includes(intent.description_line))description=`${description}${description?'\n\n':''}${intent.description_line}`;
      const form=new FormData();
      const safeName=String(b.image_name||'token-image').replace(/[^A-Za-z0-9._-]/g,'_').slice(-80)||'token-image';
      form.append('file',new Blob([image],{type}),safeName);
      form.append('name',name);
      form.append('symbol',symbol);
      form.append('description',description);
      form.append('twitter',String(b.twitter||''));
      form.append('telegram',String(b.telegram||''));
      form.append('website',String(b.website||''));
      form.append('showName','true');
      const r=await fetch(config.pumpMetadataUploadUrl,{method:'POST',body:form,signal:AbortSignal.timeout(60000)});
      const raw=await r.text();
      let payload={};try{payload=JSON.parse(raw);}catch{}
      if(!r.ok)throw Object.assign(new Error(`Pump metadata upload failed (HTTP ${r.status})`),{statusCode:502});
      const metadataUri=payload.metadataUri||payload.metadata_uri||payload.uri;
      if(!metadataUri)throw Object.assign(new Error('Pump metadata upload did not return metadataUri'),{statusCode:502});
      db.prepare(`UPDATE launch_intents SET status='metadata-ready',updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(intent.id);
      return json(res,200,{ok:true,metadataUri,descriptionLine:intent.description_line});
    }
    if(req.method==='POST'&&url.pathname==='/api/launch/prepare-create'){
      requireUserSignedLaunch();
      const b=await body(req);
      const intent=db.prepare('SELECT * FROM launch_intents WHERE id=?').get(b.intent_id||'');
      if(!intent)throw Object.assign(new Error('Launch intent not found'),{statusCode:404});
      const user=String(b.user_pubkey||'').trim(),name=String(b.name||'').trim(),symbol=String(b.symbol||'').trim().toUpperCase(),uri=String(b.metadata_uri||'').trim();
      if(!user||!name||!symbol||!uri)throw Object.assign(new Error('user_pubkey, name, symbol and metadata_uri required'),{statusCode:400});
      const solLamports=Number(b.sol_lamports||0);
      if(!Number.isSafeInteger(solLamports)||solLamports<0)throw Object.assign(new Error('Invalid initial buy amount'),{statusCode:400});
      if(solLamports>0){
        const r=await fetch(config.pumpCreateApiUrl,{
          method:'POST',
          headers:{'content-type':'application/json','accept':'application/json'},
          body:JSON.stringify({
            user,name,symbol,uri,solLamports:String(solLamports),
            mayhemMode:false,cashback:false,tokenizedAgent:false,
            frontRunningProtection:false,tipAmount:0,encoding:'base64',
            feePayer:user,creator:user
          }),
          signal:AbortSignal.timeout(30000)
        });
        const raw=await r.text();let out={};try{out=JSON.parse(raw);}catch{}
        if(!r.ok)throw Object.assign(new Error(out.error||out.message||`Pump create builder failed (HTTP ${r.status})`),{statusCode:502});
        const transactionBase64=out.transaction||out.transactionBase64;
        const mint=out.mintPublicKey||out.mint;
        if(!transactionBase64||!mint)throw Object.assign(new Error('Pump create builder returned an incomplete transaction'),{statusCode:502});
        return json(res,200,{transactionBase64,mint,requiresMintSignature:false,mode:'create-and-buy',solLamports});
      }
      if(!b.mint_pubkey)throw Object.assign(new Error('mint_pubkey required for a zero-buy launch'),{statusCode:400});
      const out=await buildPumpCreateTransaction({mint:b.mint_pubkey,user,name,symbol,uri});
      return json(res,200,out);
    }
    if(req.method==='POST'&&url.pathname==='/api/launch/created'){
      requireUserSignedLaunch();
      const b=await body(req);
      const intent=db.prepare('SELECT * FROM launch_intents WHERE id=?').get(b.intent_id||'');
      if(!intent)throw Object.assign(new Error('Launch intent not found'),{statusCode:404});
      const out=await confirmUserSignedTransaction({signature:b.tx_signature,mint:b.mint});
      db.prepare(`UPDATE launch_intents SET mint=?,creator_pubkey=COALESCE(?,creator_pubkey),status='created',tx_signature=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(b.mint,b.creator_pubkey||null,b.tx_signature||null,intent.id);
      return json(res,200,out);
    }
    if(req.method==='POST'&&url.pathname==='/api/launch/prepare-routing'){
      requireUserSignedLaunch();
      const b=await body(req);
      if(!b.mint||!b.creator_pubkey)throw Object.assign(new Error('mint and creator_pubkey required'),{statusCode:400});
      const tx=await buildFeeRoutingTransaction({mint:b.mint,creator:b.creator_pubkey});
      return json(res,200,tx);
    }
    if(req.method==='POST'&&url.pathname==='/api/launch/confirm'){
      const b=await body(req);
      if(!b.mint)throw Object.assign(new Error('mint required'),{statusCode:400});
      if(b.tx_signature)await confirmUserSignedTransaction({signature:b.tx_signature,mint:b.mint});
      const intent=b.intent_id?db.prepare('SELECT * FROM launch_intents WHERE id=?').get(b.intent_id):null;
      const fallback=intent?.recipient_handle||b.recipient_handle||'';
      const out=await verifyAndRegisterMint(b.mint,{fallbackHandle:fallback});
      if(out.ok && b.intent_id) db.prepare(`UPDATE launch_intents SET mint=?,status='registered',tx_signature=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(b.mint,b.tx_signature||null,b.intent_id);
      return json(res,out.ok?200:422,out);
    }
    if(req.method==='POST'&&url.pathname==='/api/webhooks/pump'){ requireWebhook(req); const b=await body(req); const key=b.id||b.signature||randomUUID(); try{db.prepare(`INSERT INTO webhook_events(id,source,event_key,payload_json) VALUES(?,?,?,?)`).run(randomUUID(),'pump',key,JSON.stringify(b));}catch{return json(res,200,{ok:true,duplicate:true});} const mints=[...(Array.isArray(b.mints)?b.mints:[]),...(b.mint?[b.mint]:[])]; const out=[]; for(const mint of [...new Set(mints)]){try{out.push(await verifyAndRegisterMint(mint,{fallbackHandle:b.recipient_handle||''}));}catch(e){out.push({ok:false,mint,error:e.message});}} return json(res,200,{ok:true,results:out}); }
    if(req.method==='POST'&&url.pathname==='/api/webhooks/payout'){ requireWebhook(req); requireWritable(); const b=await body(req); return json(res,200,confirmPayout({id:b.id,status:b.status||'sent',provider_ref:b.provider_ref||b.reference,confirmation_url:b.public_confirmation_url})); }
    if(req.method==='GET'&&url.pathname==='/api/auth/x/start'){ const dest=startXOAuth(); res.writeHead(302,{location:dest}); return res.end(); }
    if(req.method==='GET'&&url.pathname==='/api/auth/x/callback'){ const user=await finishXOAuth({code:url.searchParams.get('code'),state:url.searchParams.get('state')}); if(!user?.username)throw new Error('X did not return a username'); const result=optOutHandle(user.username); res.writeHead(302,{location:`/#/opt-out?done=${encodeURIComponent(result.handle)}`}); return res.end(); }
    if(req.method==='POST'&&url.pathname==='/api/admin/opt-out'){ requireAdmin(req); const b=await body(req); return json(res,200,optOutHandle(b.handle)); }
    if(req.method==='POST'&&url.pathname==='/api/admin/claim-record'){ requireAdmin(req); requireWritable(); const b=await body(req); const price=Number(b.native_usd_price||await fetchSolUsd()); return json(res,201,recordClaim({mint:b.mint,txSignature:b.tx_signature||null,grossNative:Number(b.gross_native),nativeUsdPrice:price,raw:{manual:true}})); }
    if(req.method==='POST'&&url.pathname==='/api/admin/payout-confirm'){ requireAdmin(req); requireWritable(); const b=await body(req); return json(res,200,confirmPayout({id:b.id,status:b.status||'sent',provider_ref:b.provider_ref,confirmation_url:b.public_confirmation_url})); }
    if(req.method==='POST'&&url.pathname==='/api/admin/exchange/sell'){ requireAdmin(req); requireWritable(); const b=await body(req); return json(res,200,await sellSolUsd({claimId:b.claim_id||null,volumeSol:Number(b.volume_sol)})); }
    if(req.method==='POST'&&url.pathname==='/api/admin/run/discovery'){ requireAdmin(req); return json(res,200,await runDiscovery()); }
    if(req.method==='POST'&&url.pathname==='/api/admin/run/claims'){ requireAdmin(req); requireWritable(); return json(res,200,await runClaims()); }
    if(req.method==='POST'&&url.pathname==='/api/admin/run/payouts'){ requireAdmin(req); requireWritable(); return json(res,200,await runPayouts()); }
    if(req.method==='GET'&&url.pathname==='/api/admin/status'){ requireAdmin(req); return json(res,200,{tokens:db.prepare('SELECT COUNT(*) n FROM tokens').get().n,claims:db.prepare('SELECT COUNT(*) n FROM claims').get().n,payouts:db.prepare('SELECT COUNT(*) n FROM payouts').get().n,buybacksPending:db.prepare(`SELECT COALESCE(SUM(amount_usd),0) v FROM buybacks WHERE status='pending'`).get().v,launchIntents:db.prepare('SELECT COUNT(*) n FROM launch_intents').get().n}); }
    return json(res,404,{error:'API route not found'});
  }catch(e){ const status=e.statusCode||500; if(status>=500)console.error('[api]',e); else console.warn(`[api] ${req.method} ${url.pathname} ${status}: ${e.message}`); return json(res,status,{error:e.message||'Internal error'}); }
}
