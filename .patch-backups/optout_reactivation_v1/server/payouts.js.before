import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { db, allocatePayoutItems } from './db.js';

function nextMilestone(totalSent){
  const fixed=[5,10,20,50,100,250,500,1000];
  for(const x of fixed) if(totalSent < x-1e-9) return x;
  return (Math.floor(totalSent/1000)+1)*1000;
}
function recipientBalance(handle){
  const earned=Number(db.prepare(`SELECT COALESCE(SUM(c.recipient_usd),0) v FROM claims c JOIN tokens t ON t.mint=c.mint WHERE t.recipient_handle=? COLLATE NOCASE AND c.status='confirmed'`).get(handle).v);
  const allocated=Number(db.prepare(`SELECT COALESCE(SUM(p.amount_usd),0) v FROM payouts p WHERE p.recipient_handle=? COLLATE NOCASE AND p.status IN ('queued','sent','claimed')`).get(handle).v);
  const sent=Number(db.prepare(`SELECT COALESCE(SUM(p.amount_usd),0) v FROM payouts p WHERE p.recipient_handle=? COLLATE NOCASE AND p.status IN ('sent','claimed')`).get(handle).v);
  return {earned,owed:Math.max(0,earned-allocated),sent};
}
async function sendProvider(payout){
  if(config.payoutProvider==='manual') return {status:'queued',provider_ref:null};
  if(config.payoutProvider==='http'){
    if(!config.payoutApiUrl) throw new Error('PAYOUT_API_URL not configured');
    const r=await fetch(config.payoutApiUrl,{method:'POST',headers:{'content-type':'application/json','authorization':config.payoutApiKey?`Bearer ${config.payoutApiKey}`:'','idempotency-key':payout.id},body:JSON.stringify({id:payout.id,handle:payout.recipient_handle,amount_usd:payout.amount_usd})});
    const body=await r.json().catch(()=>({})); if(!r.ok) throw new Error(`Payout API ${r.status}: ${body.error||body.message||'failed'}`);
    return {status:body.status||'sent',provider_ref:body.id||body.reference||null,raw:body};
  }
  throw new Error(`Unsupported payout provider: ${config.payoutProvider}`);
}
export async function processPayouts(){
  if(config.readOnlyMode) throw new Error('Read-only mode: payouts are disabled');
  const recipients=db.prepare(`SELECT * FROM recipients WHERE opted_out=0`).all(); const results=[];
  for(const r of recipients){
    const bal=recipientBalance(r.handle); const milestone=nextMilestone(bal.sent);
    if(bal.sent+bal.owed+1e-9 < milestone || bal.owed<=0) continue;
    const id=randomUUID(); const amount=bal.owed;
    db.prepare(`INSERT INTO payouts(id,recipient_handle,amount_usd,status,provider) VALUES(?,?,?,?,?)`).run(id,r.handle,amount,'queued',config.payoutProvider);
    allocatePayoutItems(id,r.handle,amount);
    try{
      const out=await sendProvider({id,recipient_handle:r.handle,amount_usd:amount});
      db.prepare(`UPDATE payouts SET status=?,provider_ref=?,sent_at=CASE WHEN ? IN ('sent','claimed') THEN CURRENT_TIMESTAMP ELSE sent_at END,raw_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(out.status,out.provider_ref,out.status,JSON.stringify(out.raw||{}),id);
      results.push({id,handle:r.handle,amount,status:out.status,milestone});
    }catch(e){ db.prepare(`UPDATE payouts SET status='failed',raw_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(JSON.stringify({error:e.message}),id); results.push({id,handle:r.handle,amount,status:'failed',error:e.message}); }
  }
  return results;
}
export function confirmPayout({id,status='sent',provider_ref=null,confirmation_url=null}){
  const row=db.prepare('SELECT * FROM payouts WHERE id=?').get(id); if(!row)throw new Error('Payout not found');
  db.prepare(`UPDATE payouts SET status=?,provider_ref=COALESCE(?,provider_ref),public_confirmation_url=COALESCE(?,public_confirmation_url),sent_at=CASE WHEN ? IN ('sent','claimed') THEN COALESCE(sent_at,CURRENT_TIMESTAMP) ELSE sent_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status,provider_ref,confirmation_url,status,id);
  return db.prepare('SELECT * FROM payouts WHERE id=?').get(id);
}
export function optOutHandle(handle){
  const h=String(handle).replace(/^@/,''); const r=db.prepare('SELECT * FROM recipients WHERE handle=? COLLATE NOCASE').get(h); if(!r)throw new Error('Recipient not found');
  db.exec('BEGIN IMMEDIATE');
  try{
    const bal=recipientBalance(h);
    db.prepare(`UPDATE recipients SET opted_out=1,opt_out_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE handle=? COLLATE NOCASE`).run(h);
    db.prepare(`UPDATE tokens SET hidden=1,updated_at=CURRENT_TIMESTAMP WHERE recipient_handle=? COLLATE NOCASE`).run(h);
    if(bal.owed>0) db.prepare(`INSERT INTO buybacks(id,source,amount_usd,status) VALUES(?,?,?,'pending')`).run(randomUUID(),'opt_out_unpaid_balance',bal.owed);
    db.exec('COMMIT'); return {handle:h,optedOut:true,divertedUsd:bal.owed};
  }catch(e){db.exec('ROLLBACK');throw e;}
}
