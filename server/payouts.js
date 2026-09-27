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
  const allocated=Number(db.prepare(`SELECT COALESCE(SUM(p.amount_usd),0) v FROM payouts p WHERE p.recipient_handle=? COLLATE NOCASE AND p.status IN ('queued','sent','claimed','diverted')`).get(handle).v);
  const sent=Number(db.prepare(`SELECT COALESCE(SUM(p.amount_usd),0) v FROM payouts p WHERE p.recipient_handle=? COLLATE NOCASE AND p.status IN ('sent','claimed')`).get(handle).v);
  return {earned,owed:Math.max(0,earned-allocated),sent};
}

function cancelQueuedPayouts(handle){
  const out=db.prepare(`UPDATE payouts
    SET status='cancelled',updated_at=CURRENT_TIMESTAMP
    WHERE recipient_handle=? COLLATE NOCASE AND status='queued'`).run(handle);
  return Number(out?.changes||0);
}

function createDiversion(handle,amountUsd,{recordBuyback=true}={}){
  const amount=Math.max(0,Number(amountUsd||0));
  if(amount<=0.000001) return null;
  const id=randomUUID();
  db.prepare(`INSERT INTO payouts(id,recipient_handle,amount_usd,status,provider,raw_json)
    VALUES(?,?,?,'diverted','protocol_opt_out',?)`)
    .run(id,handle,amount,JSON.stringify({reason:'recipient_opt_out'}));
  const remaining=allocatePayoutItems(id,handle,amount,{includeHidden:true,claimsOnly:true});
  if(remaining>0.0001) throw new Error(`Unable to allocate ${remaining.toFixed(6)} USD of opt-out diversion for @${handle}`);
  if(recordBuyback){
    db.prepare(`INSERT INTO buybacks(id,source,amount_usd,status,raw_json)
      VALUES(?,?,?,'pending',?)`)
      .run(randomUUID(),'opt_out_unpaid_balance',amount,JSON.stringify({recipient_handle:handle,payout_id:id}));
  }
  return {id,amountUsd:amount};
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
    const latest=db.prepare('SELECT opted_out FROM recipients WHERE handle=? COLLATE NOCASE').get(r.handle);
    if(latest?.opted_out) continue;
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
  const h=String(handle||'').replace(/^@/,'').trim();
  if(!h) throw new Error('Recipient handle required');
  db.prepare(`INSERT INTO recipients(handle,display_name) VALUES(?,?)
    ON CONFLICT(handle) DO NOTHING`).run(h,h);
  const current=db.prepare('SELECT * FROM recipients WHERE handle=? COLLATE NOCASE').get(h);
  if(current?.opted_out) return {handle:h,optedOut:true,alreadyOptedOut:true,divertedUsd:0,cancelledQueued:0};

  db.exec('BEGIN IMMEDIATE');
  try{
    const cancelledQueued=cancelQueuedPayouts(h);
    const bal=recipientBalance(h);
    const diversion=createDiversion(h,bal.owed,{recordBuyback:true});
    db.prepare(`UPDATE recipients
      SET opted_out=1,opt_out_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE handle=? COLLATE NOCASE`).run(h);
    db.prepare(`UPDATE tokens
      SET opt_out_hidden=1,updated_at=CURRENT_TIMESTAMP
      WHERE recipient_handle=? COLLATE NOCASE`).run(h);
    db.prepare(`UPDATE token_chain_state
      SET opt_out_reserved_lamports=distributable_lamports,
          recipient_unclaimed_usd=0,
          protocol_unclaimed_usd=COALESCE(gross_unclaimed_usd,0),
          indexed_at=CURRENT_TIMESTAMP
      WHERE mint IN (SELECT mint FROM tokens WHERE recipient_handle=? COLLATE NOCASE)`).run(h);
    const reservedLamports=Number(db.prepare(`SELECT COALESCE(SUM(s.opt_out_reserved_lamports),0) v
      FROM token_chain_state s JOIN tokens t ON t.mint=s.mint
      WHERE t.recipient_handle=? COLLATE NOCASE AND s.active=1`).get(h)?.v||0);
    db.exec('COMMIT');
    return {handle:h,optedOut:true,divertedUsd:diversion?.amountUsd||0,cancelledQueued,reservedLamports};
  }catch(e){db.exec('ROLLBACK');throw e;}
}

export function reactivateHandle(handle){
  const h=String(handle||'').replace(/^@/,'').trim();
  if(!h) throw new Error('Recipient handle required');
  const current=db.prepare('SELECT * FROM recipients WHERE handle=? COLLATE NOCASE').get(h);
  if(!current) throw new Error('Recipient not found');
  if(!current.opted_out) return {handle:h,optedOut:false,active:true,alreadyActive:true,legacyDivertedUsd:0,cancelledQueued:0};

  db.exec('BEGIN IMMEDIATE');
  try{
    const cancelledQueued=cancelQueuedPayouts(h);

    // Legacy versions could leave queued payouts and unpaid claimed balance behind.
    // Permanently allocate that balance to protocol accounting before reactivation.
    const legacyBal=recipientBalance(h);
    const legacyDiversion=createDiversion(h,legacyBal.owed,{recordBuyback:false});

    // Freeze every currently-unclaimed lamport that accrued before reactivation.
    // New lamports after reactivation can resume the normal recipient/protocol split.
    db.prepare(`UPDATE token_chain_state
      SET opt_out_reserved_lamports=MAX(COALESCE(opt_out_reserved_lamports,0),distributable_lamports),
          recipient_unclaimed_usd=0,
          protocol_unclaimed_usd=COALESCE(gross_unclaimed_usd,0),
          indexed_at=CURRENT_TIMESTAMP
      WHERE mint IN (SELECT mint FROM tokens WHERE recipient_handle=? COLLATE NOCASE)`).run(h);

    db.prepare(`UPDATE recipients
      SET opted_out=0,reactivated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE handle=? COLLATE NOCASE`).run(h);
    db.prepare(`UPDATE tokens
      SET opt_out_hidden=0,updated_at=CURRENT_TIMESTAMP
      WHERE recipient_handle=? COLLATE NOCASE`).run(h);
    db.exec('COMMIT');
    return {handle:h,optedOut:false,active:true,legacyDivertedUsd:legacyDiversion?.amountUsd||0,cancelledQueued};
  }catch(e){db.exec('ROLLBACK');throw e;}
}
