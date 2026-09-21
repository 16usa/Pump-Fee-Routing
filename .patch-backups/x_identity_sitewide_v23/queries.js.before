import { db, tokenFinancialsWhere, getIndexerStatus } from './db.js';

const mapToken = (t) => ({
  mint:t.mint, contract:t.mint, venue:t.venue, platform:t.venue==='pump'?'Pump':'Pons', name:t.name, symbol:t.symbol,
  image_url:t.image_url || '', description:t.description || '', recipient_handle:t.recipient_handle,
  profile:t.recipient_handle, mc:Number(t.market_cap_usd||0), market_cap_usd:Number(t.market_cap_usd||0),
  sent:Number(t.sent_usd||0), owed:Number(t.owed_usd||0), earned:Number(t.earned_usd||0), permanent:!!t.permanent,
  fee_share_bps:Number(t.fee_share_bps||0), created_at:t.created_at, discovered_at:t.discovered_at,
  distributable_lamports:t.distributable_lamports == null ? null : Number(t.distributable_lamports),
  minimum_required_lamports:t.minimum_required_lamports == null ? null : Number(t.minimum_required_lamports),
  claimable_usd:t.gross_unclaimed_usd == null ? null : Number(t.gross_unclaimed_usd),
  indexed_sol_usd:t.indexed_sol_usd == null ? null : Number(t.indexed_sol_usd),
  can_distribute:t.can_distribute == null ? null : !!t.can_distribute,
  is_graduated:t.is_graduated == null ? null : !!t.is_graduated,
  chain_indexed_at:t.chain_indexed_at || null,
  age: age(t.created_at || t.discovered_at)
});
function age(value){ const ms=Math.max(0,Date.now()-new Date(value).getTime()); const m=Math.floor(ms/60000); if(m<60)return `${m}m`; const h=Math.floor(m/60); if(h<24)return `${h}h`; return `${Math.floor(h/24)}d`; }

export function listTokens({search='',sort='sent',venue='',limit=100}={}) {
  const clauses=['t.hidden=0']; const params=[];
  if (search) { clauses.push('(t.mint LIKE ? OR t.name LIKE ? OR t.symbol LIKE ? OR t.recipient_handle LIKE ?)'); const q=`%${search}%`; params.push(q,q,q,q); }
  if (venue) { clauses.push('t.venue=?'); params.push(venue); }
  let rows=tokenFinancialsWhere(clauses.join(' AND '),params).map(mapToken);
  if(sort==='mc') rows.sort((a,b)=>b.mc-a.mc);
  else if(sort==='recent') rows.sort((a,b)=>new Date(b.discovered_at)-new Date(a.discovered_at));
  else rows.sort((a,b)=>b.sent-a.sent);
  return rows.slice(0, Math.min(500,Number(limit)||100));
}
export function getToken(mint){ const row=tokenFinancialsWhere('t.mint=? AND t.hidden=0',[mint])[0]; if(!row)return null; const token=mapToken(row); token.claims=db.prepare('SELECT * FROM claims WHERE mint=? ORDER BY created_at DESC LIMIT 100').all(mint); token.payouts=db.prepare(`SELECT p.*,pi.amount_usd item_amount_usd FROM payout_items pi JOIN payouts p ON p.id=pi.payout_id WHERE pi.mint=? ORDER BY p.created_at DESC`).all(mint); token.chain=db.prepare(`SELECT sharing_config_address,verified_slot,admin_revoked,sole_treasury,fee_share_bps,distributable_lamports,minimum_required_lamports,can_distribute,is_graduated,sol_usd,gross_unclaimed_usd,recipient_unclaimed_usd,protocol_unclaimed_usd,indexed_at FROM token_chain_state WHERE mint=? AND active=1`).get(mint)||null; return token; }
export function listPayments(limit=50){ return db.prepare(`SELECT p.*,r.display_name,r.avatar_url, GROUP_CONCAT(pi.mint) mints FROM payouts p LEFT JOIN recipients r ON r.handle=p.recipient_handle LEFT JOIN payout_items pi ON pi.payout_id=p.id GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?`).all(Number(limit)); }
export function moneySummary(){
  const totalPaid=Number(db.prepare(`SELECT COALESCE(SUM(amount_usd),0) v FROM payouts WHERE status IN ('sent','claimed')`).get().v);
  const indexedOwed=Number(db.prepare(`SELECT COALESCE(SUM(recipient_unclaimed_usd),0) v FROM token_chain_state WHERE active=1`).get().v);
  const totalOwed=Number(db.prepare(`SELECT COALESCE(SUM(recipient_usd),0) v FROM claims WHERE status='confirmed'`).get().v)+indexedOwed-Number(db.prepare(`SELECT COALESCE(SUM(pi.amount_usd),0) v FROM payout_items pi JOIN payouts p ON p.id=pi.payout_id WHERE p.status IN ('sent','claimed')`).get().v);
  const protocolPending=Number(db.prepare(`SELECT COALESCE(SUM(amount_usd),0) v FROM buybacks WHERE status='pending'`).get().v)+Number(db.prepare(`SELECT COALESCE(SUM(protocol_unclaimed_usd),0) v FROM token_chain_state WHERE active=1`).get().v);
  const recent=listPayments(50);
  const topPaid=db.prepare(`SELECT r.handle,r.display_name,r.avatar_url,COALESCE(SUM(p.amount_usd),0) received FROM recipients r JOIN payouts p ON p.recipient_handle=r.handle WHERE p.status IN ('sent','claimed') GROUP BY r.handle ORDER BY received DESC LIMIT 10`).all();
  const exchange=db.prepare(`SELECT * FROM exchange_orders ORDER BY created_at DESC LIMIT 20`).all();
  return {totalPaid,totalOwed:Math.max(0,totalOwed),protocolPending,recent,topPaid,exchange,indexer:getIndexerStatus()};
}
export function profile(handle){
  const recipient=db.prepare('SELECT * FROM recipients WHERE handle=? COLLATE NOCASE').get(handle); if(!recipient)return null;
  const tokens=listTokens({limit:500}).filter(t=>t.recipient_handle.toLowerCase()===String(handle).replace(/^@/,'').toLowerCase());
  const payments=db.prepare(`SELECT * FROM payouts WHERE recipient_handle=? COLLATE NOCASE ORDER BY created_at DESC LIMIT 100`).all(handle);
  return {recipient,tokens,payments,received:payments.filter(p=>['sent','claimed'].includes(p.status)).reduce((a,p)=>a+Number(p.amount_usd),0)};
}
export function homeData(){ const tokens=listTokens({limit:40}); return {tokens, trending:tokens.slice(0,10), payments:listPayments(12), money:moneySummary(), profiles:db.prepare(`SELECT r.handle,r.display_name,r.avatar_url,r.banner_url,r.verified,r.verified_type,COUNT(DISTINCT t.mint) token_count,COALESCE(SUM(p.amount_usd),0) received FROM recipients r LEFT JOIN tokens t ON t.recipient_handle=r.handle AND t.hidden=0 LEFT JOIN payouts p ON p.recipient_handle=r.handle AND p.status IN ('sent','claimed') WHERE r.opted_out=0 GROUP BY r.handle ORDER BY received DESC LIMIT 12`).all()}; }
