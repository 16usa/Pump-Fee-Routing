import { config } from './config.js';
import { db } from './db.js';
import { discoverOnChain, claimMint } from './solana.js';
import { processPayouts } from './payouts.js';

let running={discover:false,claims:false,payouts:false};
export async function runDiscovery(){ if(running.discover)return {skipped:'already-running'}; running.discover=true; try{return await discoverOnChain();} finally{running.discover=false;} }
export async function runClaims(){ if(running.claims)return {skipped:'already-running'}; running.claims=true; const out=[]; try{ const rows=db.prepare(`SELECT mint FROM tokens WHERE hidden=0 AND permanent=1 AND fee_share_bps=10000 ORDER BY updated_at ASC LIMIT 100`).all(); for(const r of rows){ try{out.push({mint:r.mint,...await claimMint(r.mint)});}catch(e){out.push({mint:r.mint,ok:false,error:e.message});} } return out; } finally{running.claims=false;} }
export async function runPayouts(){ if(running.payouts)return {skipped:'already-running'}; running.payouts=true; try{return await processPayouts();}finally{running.payouts=false;} }
export function startWorkers(){
  console.log(`[workers] readOnly=${config.readOnlyMode} discovery=${config.onchainDiscoveryEnabled} claims=${!config.readOnlyMode && config.claimWorkerEnabled && config.liveChainTransactions} payouts=${!config.readOnlyMode && config.payoutWorkerEnabled}`);
  if(config.onchainDiscoveryEnabled){
    setTimeout(()=>runDiscovery().catch(e=>console.error('[discovery] scheduled run failed:',e.message)),5000);
    setInterval(()=>runDiscovery().catch(e=>console.error('[discovery] scheduled run failed:',e.message)),config.discoveryIntervalMs).unref();
  }
  if(!config.readOnlyMode && config.claimWorkerEnabled && config.liveChainTransactions) setInterval(()=>runClaims().catch(e=>console.error('[claims] worker failed:',e.message)),config.claimIntervalMs).unref();
  if(!config.readOnlyMode && config.payoutWorkerEnabled) setInterval(()=>runPayouts().catch(e=>console.error('[payouts] worker failed:',e.message)),config.payoutIntervalMs).unref();
}
