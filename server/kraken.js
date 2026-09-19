import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { db } from './db.js';

function signKraken(path, params, secret){
  const nonce=params.nonce; const post=new URLSearchParams(params).toString();
  const hash=crypto.createHash('sha256').update(nonce+post).digest();
  return crypto.createHmac('sha512',Buffer.from(secret,'base64')).update(Buffer.concat([Buffer.from(path),hash])).digest('base64');
}
export async function sellSolUsd({claimId=null,volumeSol}){
  if(config.readOnlyMode) throw new Error('Read-only mode: exchange trades are disabled');
  const id=randomUUID();
  db.prepare(`INSERT INTO exchange_orders(id,claim_id,provider,side,pair,volume_native,status) VALUES(?,?,?,'sell','SOLUSD',?,'queued')`).run(id,claimId,'kraken',volumeSol);
  if(config.exchangeProvider!=='kraken' || !config.krakenLiveTrading){ return {id,status:'queued',dryRun:true}; }
  if(!config.krakenApiKey||!config.krakenApiSecret) throw new Error('Kraken credentials not configured');
  const path='/0/private/AddOrder'; const params={nonce:String(Date.now()*1000),ordertype:'market',type:'sell',pair:'SOLUSD',volume:String(volumeSol)};
  const r=await fetch('https://api.kraken.com'+path,{method:'POST',headers:{'API-Key':config.krakenApiKey,'API-Sign':signKraken(path,params,config.krakenApiSecret),'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params)});
  const j=await r.json(); if(!r.ok||j.error?.length) { db.prepare(`UPDATE exchange_orders SET status='failed',raw_json=? WHERE id=?`).run(JSON.stringify(j),id); throw new Error(j.error?.join(',')||`Kraken ${r.status}`); }
  const ref=j.result?.txid?.[0]||null; db.prepare(`UPDATE exchange_orders SET status='submitted',provider_ref=?,raw_json=? WHERE id=?`).run(ref,JSON.stringify(j),id); return {id,status:'submitted',providerRef:ref};
}
