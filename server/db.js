import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';

const dataDir = path.resolve('data');
fs.mkdirSync(dataDir, { recursive: true });
export const db = new DatabaseSync(path.join(dataDir, 'app.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recipients (
      handle TEXT PRIMARY KEY COLLATE NOCASE,
      x_user_id TEXT,
      display_name TEXT,
      bio TEXT,
      avatar_url TEXT,
      banner_url TEXT,
      verified INTEGER NOT NULL DEFAULT 0,
      verified_type TEXT,
      opted_out INTEGER NOT NULL DEFAULT 0,
      opt_out_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tokens (
      mint TEXT PRIMARY KEY,
      venue TEXT NOT NULL DEFAULT 'pump',
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      image_url TEXT,
      description TEXT,
      recipient_handle TEXT NOT NULL COLLATE NOCASE,
      recipient_source TEXT NOT NULL DEFAULT 'description',
      market_cap_usd REAL NOT NULL DEFAULT 0,
      fee_share_bps INTEGER NOT NULL DEFAULT 0,
      permanent INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0,
      fee_config_address TEXT,
      created_at TEXT,
      discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata_json TEXT,
      FOREIGN KEY(recipient_handle) REFERENCES recipients(handle)
    );
    CREATE INDEX IF NOT EXISTS idx_tokens_recipient ON tokens(recipient_handle);
    CREATE INDEX IF NOT EXISTS idx_tokens_created ON tokens(created_at);
    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      mint TEXT NOT NULL,
      chain TEXT NOT NULL DEFAULT 'solana',
      tx_signature TEXT UNIQUE,
      gross_native REAL NOT NULL,
      native_symbol TEXT NOT NULL DEFAULT 'SOL',
      native_usd_price REAL NOT NULL,
      gross_usd REAL NOT NULL,
      recipient_usd REAL NOT NULL,
      protocol_usd REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      confirmed_at TEXT,
      raw_json TEXT,
      FOREIGN KEY(mint) REFERENCES tokens(mint)
    );
    CREATE INDEX IF NOT EXISTS idx_claims_mint ON claims(mint);
    CREATE TABLE IF NOT EXISTS payouts (
      id TEXT PRIMARY KEY,
      recipient_handle TEXT NOT NULL COLLATE NOCASE,
      amount_usd REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      provider TEXT NOT NULL,
      provider_ref TEXT,
      public_confirmation_url TEXT,
      sent_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      raw_json TEXT,
      FOREIGN KEY(recipient_handle) REFERENCES recipients(handle)
    );
    CREATE INDEX IF NOT EXISTS idx_payouts_recipient ON payouts(recipient_handle);
    CREATE TABLE IF NOT EXISTS payout_items (
      payout_id TEXT NOT NULL,
      mint TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      PRIMARY KEY(payout_id, mint),
      FOREIGN KEY(payout_id) REFERENCES payouts(id) ON DELETE CASCADE,
      FOREIGN KEY(mint) REFERENCES tokens(mint)
    );
    CREATE TABLE IF NOT EXISTS buybacks (
      id TEXT PRIMARY KEY,
      claim_id TEXT,
      source TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      tx_signature TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      raw_json TEXT,
      FOREIGN KEY(claim_id) REFERENCES claims(id)
    );
    CREATE TABLE IF NOT EXISTS exchange_orders (
      id TEXT PRIMARY KEY,
      claim_id TEXT,
      provider TEXT NOT NULL,
      side TEXT NOT NULL,
      pair TEXT NOT NULL,
      volume_native REAL NOT NULL,
      gross_usd REAL,
      fee_usd REAL,
      received_usd REAL,
      provider_ref TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      filled_at TEXT,
      raw_json TEXT,
      FOREIGN KEY(claim_id) REFERENCES claims(id)
    );
    CREATE TABLE IF NOT EXISTS launch_intents (
      id TEXT PRIMARY KEY,
      mint TEXT,
      recipient_handle TEXT NOT NULL COLLATE NOCASE,
      creator_pubkey TEXT,
      description_line TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      tx_signature TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      event_key TEXT UNIQUE,
      payload_json TEXT NOT NULL,
      processed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS indexer_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS token_chain_state (
      mint TEXT PRIMARY KEY,
      sharing_config_address TEXT NOT NULL,
      verified_slot INTEGER,
      admin_revoked INTEGER NOT NULL DEFAULT 0,
      sole_treasury INTEGER NOT NULL DEFAULT 0,
      fee_share_bps INTEGER NOT NULL DEFAULT 0,
      distributable_lamports INTEGER NOT NULL DEFAULT 0,
      minimum_required_lamports INTEGER NOT NULL DEFAULT 0,
      can_distribute INTEGER NOT NULL DEFAULT 0,
      is_graduated INTEGER NOT NULL DEFAULT 0,
      sol_usd REAL,
      gross_unclaimed_usd REAL,
      recipient_unclaimed_usd REAL,
      protocol_unclaimed_usd REAL,
      active INTEGER NOT NULL DEFAULT 1,
      shareholders_json TEXT NOT NULL DEFAULT '[]',
      last_error TEXT,
      indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mint) REFERENCES tokens(mint) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_token_chain_active ON token_chain_state(active, indexed_at);
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      code_verifier TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  /* x-profile-banner-columns-v22-1 */
  const recipientColumns=new Set(
    db.prepare('PRAGMA table_info(recipients)').all().map(row=>String(row.name||''))
  );
  if(!recipientColumns.has('banner_url')) db.exec('ALTER TABLE recipients ADD COLUMN banner_url TEXT');
  if(!recipientColumns.has('verified')) db.exec('ALTER TABLE recipients ADD COLUMN verified INTEGER NOT NULL DEFAULT 0');
  if(!recipientColumns.has('verified_type')) db.exec('ALTER TABLE recipients ADD COLUMN verified_type TEXT');
}

function upsertRecipient(handle, displayName = null) {
  const h = String(handle || '').replace(/^@/, '').trim();
  if (!h) throw new Error('recipient handle required');
  db.prepare(`INSERT INTO recipients(handle, display_name) VALUES(?, ?)
    ON CONFLICT(handle) DO UPDATE SET
      display_name=CASE
        WHEN excluded.display_name IS NULL OR lower(excluded.display_name)=lower(excluded.handle)
          THEN COALESCE(NULLIF(recipients.display_name,''),excluded.display_name)
        ELSE excluded.display_name
      END,
      updated_at=CURRENT_TIMESTAMP`).run(h, displayName);
  return h;
}

export function upsertToken(token) {
  const handle = upsertRecipient(token.recipient_handle, token.recipient_display_name || token.recipient_handle);
  db.prepare(`INSERT INTO tokens(
    mint,venue,name,symbol,image_url,description,recipient_handle,recipient_source,market_cap_usd,
    fee_share_bps,permanent,hidden,fee_config_address,created_at,metadata_json
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(mint) DO UPDATE SET
    venue=excluded.venue,name=excluded.name,symbol=excluded.symbol,image_url=excluded.image_url,
    description=excluded.description,recipient_handle=excluded.recipient_handle,recipient_source=excluded.recipient_source,
    market_cap_usd=excluded.market_cap_usd,fee_share_bps=excluded.fee_share_bps,permanent=excluded.permanent,
    hidden=excluded.hidden,fee_config_address=excluded.fee_config_address,created_at=COALESCE(excluded.created_at,tokens.created_at),
    metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`).run(
      token.mint, token.venue || 'pump', token.name || 'Unknown token', token.symbol || 'TOKEN', token.image_url || '',
      token.description || '', handle, token.recipient_source || 'description', Number(token.market_cap_usd || 0),
      Number(token.fee_share_bps || 0), token.permanent ? 1 : 0, token.hidden ? 1 : 0, token.fee_config_address || '',
      token.created_at || null, JSON.stringify(token.metadata || {})
    );
}

export function upsertTokenChainState(state) {
  db.prepare(`INSERT INTO token_chain_state(
    mint,sharing_config_address,verified_slot,admin_revoked,sole_treasury,fee_share_bps,
    distributable_lamports,minimum_required_lamports,can_distribute,is_graduated,sol_usd,
    gross_unclaimed_usd,recipient_unclaimed_usd,protocol_unclaimed_usd,active,
    shareholders_json,last_error,indexed_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
  ON CONFLICT(mint) DO UPDATE SET
    sharing_config_address=excluded.sharing_config_address,verified_slot=excluded.verified_slot,
    admin_revoked=excluded.admin_revoked,sole_treasury=excluded.sole_treasury,
    fee_share_bps=excluded.fee_share_bps,distributable_lamports=excluded.distributable_lamports,
    minimum_required_lamports=excluded.minimum_required_lamports,can_distribute=excluded.can_distribute,
    is_graduated=excluded.is_graduated,sol_usd=excluded.sol_usd,
    gross_unclaimed_usd=excluded.gross_unclaimed_usd,
    recipient_unclaimed_usd=excluded.recipient_unclaimed_usd,
    protocol_unclaimed_usd=excluded.protocol_unclaimed_usd,active=excluded.active,
    shareholders_json=excluded.shareholders_json,last_error=excluded.last_error,
    indexed_at=CURRENT_TIMESTAMP`).run(
      state.mint, state.sharing_config_address, state.verified_slot ?? null,
      state.admin_revoked ? 1 : 0, state.sole_treasury ? 1 : 0, Number(state.fee_share_bps || 0),
      Number(state.distributable_lamports || 0), Number(state.minimum_required_lamports || 0),
      state.can_distribute ? 1 : 0, state.is_graduated ? 1 : 0,
      state.sol_usd == null ? null : Number(state.sol_usd),
      state.gross_unclaimed_usd == null ? null : Number(state.gross_unclaimed_usd),
      state.recipient_unclaimed_usd == null ? null : Number(state.recipient_unclaimed_usd),
      state.protocol_unclaimed_usd == null ? null : Number(state.protocol_unclaimed_usd),
      state.active === false ? 0 : 1, JSON.stringify(state.shareholders || []),
      state.last_error || null
    );
}

export function finalizeChainDiscovery(seenMints) {
  db.exec('BEGIN IMMEDIATE');
  try {
    if (seenMints.length) {
      const placeholders=seenMints.map(()=>'?').join(',');
      db.prepare(`UPDATE token_chain_state SET active=0 WHERE mint NOT IN (${placeholders})`).run(...seenMints);
      db.prepare(`UPDATE tokens SET hidden=1,updated_at=CURRENT_TIMESTAMP
        WHERE venue='pump' AND mint NOT IN (${placeholders})`).run(...seenMints);
    } else {
      db.prepare(`UPDATE token_chain_state SET active=0`).run();
      db.prepare(`UPDATE tokens SET hidden=1,updated_at=CURRENT_TIMESTAMP WHERE venue='pump'`).run();
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function setIndexerState(key, value) {
  db.prepare(`INSERT INTO indexer_state(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`)
    .run(key, value == null ? '' : String(value));
}

export function getIndexerStatus() {
  const values=Object.fromEntries(db.prepare(`SELECT key,value FROM indexer_state WHERE key LIKE 'discovery_%'`).all().map(r=>[r.key,r.value]));
  const number=(key)=>values[key] === undefined || values[key] === '' ? null : Number(values[key]);
  return {
    status:values.discovery_status || 'never-run',
    startedAt:values.discovery_started_at || null,
    completedAt:values.discovery_completed_at || null,
    lastError:values.discovery_error || null,
    checked:number('discovery_checked'),
    matched:number('discovery_matched'),
    indexed:number('discovery_indexed'),
    rejected:number('discovery_rejected'),
    tokenErrors:number('discovery_token_errors'),
    slot:number('discovery_slot')
  };
}

export function recordClaim({ mint, txSignature, grossNative, nativeUsdPrice, raw = null }) {
  const token = db.prepare(`SELECT t.*, r.opted_out FROM tokens t JOIN recipients r ON r.handle=t.recipient_handle WHERE mint=?`).get(mint);
  if (!token) throw new Error(`Unknown token ${mint}`);
  if (txSignature) {
    const existing = db.prepare('SELECT * FROM claims WHERE tx_signature=?').get(txSignature);
    if (existing) return existing;
  }
  const grossUsd = grossNative * nativeUsdPrice;
  const recipientUsd = token.opted_out ? 0 : grossUsd * config.recipientShareBps / 10000;
  const protocolUsd = grossUsd - recipientUsd;
  const id = randomUUID();
  const tx = db.prepare(`INSERT INTO claims(id,mint,tx_signature,gross_native,native_usd_price,gross_usd,recipient_usd,protocol_usd,confirmed_at,raw_json)
    VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?)`);
  db.exec('BEGIN IMMEDIATE');
  try {
    tx.run(id,mint,txSignature || null,grossNative,nativeUsdPrice,grossUsd,recipientUsd,protocolUsd,JSON.stringify(raw || {}));
    db.prepare(`INSERT INTO buybacks(id,claim_id,source,amount_usd) VALUES(?,?,?,?)`).run(randomUUID(), id, token.opted_out ? 'opted_out_recipient' : 'protocol_cut', protocolUsd);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return db.prepare('SELECT * FROM claims WHERE id=?').get(id);
}

export function tokenFinancialsWhere(whereSql = '1=1', params = []) {
  return db.prepare(`
    SELECT t.*,
      COALESCE((SELECT SUM(c.recipient_usd) FROM claims c WHERE c.mint=t.mint AND c.status='confirmed'),0) +
        COALESCE((SELECT s.recipient_unclaimed_usd FROM token_chain_state s WHERE s.mint=t.mint AND s.active=1),0) AS earned_usd,
      COALESCE((SELECT SUM(pi.amount_usd) FROM payout_items pi JOIN payouts p ON p.id=pi.payout_id WHERE pi.mint=t.mint AND p.status IN ('sent','claimed')),0) AS sent_usd,
      MAX(0,
        COALESCE((SELECT SUM(c.recipient_usd) FROM claims c WHERE c.mint=t.mint AND c.status='confirmed'),0) +
        COALESCE((SELECT s.recipient_unclaimed_usd FROM token_chain_state s WHERE s.mint=t.mint AND s.active=1),0) -
        COALESCE((SELECT SUM(pi.amount_usd) FROM payout_items pi JOIN payouts p ON p.id=pi.payout_id WHERE pi.mint=t.mint AND p.status IN ('sent','claimed')),0)
      ) AS owed_usd,
      (SELECT s.distributable_lamports FROM token_chain_state s WHERE s.mint=t.mint AND s.active=1) AS distributable_lamports,
      (SELECT s.minimum_required_lamports FROM token_chain_state s WHERE s.mint=t.mint AND s.active=1) AS minimum_required_lamports,
      (SELECT s.gross_unclaimed_usd FROM token_chain_state s WHERE s.mint=t.mint AND s.active=1) AS gross_unclaimed_usd,
      (SELECT s.sol_usd FROM token_chain_state s WHERE s.mint=t.mint AND s.active=1) AS indexed_sol_usd,
      (SELECT s.can_distribute FROM token_chain_state s WHERE s.mint=t.mint AND s.active=1) AS can_distribute,
      (SELECT s.is_graduated FROM token_chain_state s WHERE s.mint=t.mint AND s.active=1) AS is_graduated,
      (SELECT s.indexed_at FROM token_chain_state s WHERE s.mint=t.mint AND s.active=1) AS chain_indexed_at
    FROM tokens t
    WHERE ${whereSql}
  `).all(...params);
}

export function allocatePayoutItems(payoutId, handle, amountUsd) {
  let remaining = amountUsd;
  const rows = tokenFinancialsWhere(`t.recipient_handle=? COLLATE NOCASE AND t.hidden=0`, [handle])
    .filter(x => x.owed_usd > 0).sort((a,b) => String(a.discovered_at).localeCompare(String(b.discovered_at)));
  for (const row of rows) {
    if (remaining <= 0.000001) break;
    const take = Math.min(remaining, row.owed_usd);
    db.prepare(`INSERT INTO payout_items(payout_id,mint,amount_usd) VALUES(?,?,?)
      ON CONFLICT(payout_id,mint) DO UPDATE SET amount_usd=amount_usd+excluded.amount_usd`).run(payoutId,row.mint,take);
    remaining -= take;
  }
  return Math.max(0, remaining);
}

export function seedIfEmpty() {
  if (!config.seedDemo) {
    purgeDemoData();
    return;
  }
  const n = db.prepare('SELECT COUNT(*) n FROM tokens').get().n;
  if (n) return;
  const demo = [
    ['GY9mZfDemo11111111111111111111111111111pump','Elon Coin','ELON','elonmusk',3600000,85964.01,11439.43,'E'],
    ['9U1f18Demo22222222222222222222222222222','Solana Cat','SOLCAT','solana',984800,60170.75,1732.44,'S'],
    ['Hk8UiqDemo33333333333333333333333333333','Nikita Boar','BOAR','nikitabier',233400,34966.50,1756.73,'N'],
    ['GZik7vDemo44444444444444444444444444444','Kevin Startup Fund','KEVIN','kevinbass',39800,32136.17,1850.19,'K'],
    ['AL44bCDemo555555555555555555555555555555','TRUMP','TRUMP','realDonaldTrump',73900,21581.21,123.57,'T'],
    ['JoBxYVDemo66666666666666666666666666666','WANG','WANG','humaneworld',59100,21104.82,860.42,'W'],
    ['SPqTn8Demo77777777777777777777777777777','Grok Coin','GROK','grok',21900,13734.27,334.94,'G'],
    ['57eBR7Demo88888888888888888888888888888','Github Cat','GITCAT','github',28500,9788.29,407.08,'GH']
  ];
  for (let i=0;i<demo.length;i++) {
    const [mint,name,symbol,handle,mc,sent,owed,accent] = demo[i];
    upsertToken({mint,name,symbol,recipient_handle:handle,recipient_display_name:handle,market_cap_usd:mc,fee_share_bps:10000,permanent:true,created_at:new Date(Date.now()-(i+1)*86400000).toISOString(),metadata:{accent}});
    const grossRecipient = sent + owed;
    const grossUsd = grossRecipient / (config.recipientShareBps/10000);
    const c = recordClaim({mint,txSignature:`demo-claim-${i}`,grossNative:grossUsd/100,nativeUsdPrice:100,raw:{demo:true}});
    const pid = randomUUID();
    db.prepare(`INSERT INTO payouts(id,recipient_handle,amount_usd,status,provider,provider_ref,sent_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(pid,handle,sent,'sent','demo',`demo-payout-${i}`);
    db.prepare(`INSERT INTO payout_items(payout_id,mint,amount_usd) VALUES(?,?,?)`).run(pid,mint,sent);
    db.prepare(`UPDATE recipients SET display_name=? WHERE handle=?`).run(handle,handle);
  }
}

export function purgeDemoData() {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      DELETE FROM payout_items WHERE payout_id IN (SELECT id FROM payouts WHERE provider='demo');
      DELETE FROM payouts WHERE provider='demo';
      DELETE FROM buybacks WHERE claim_id IN (SELECT id FROM claims WHERE tx_signature LIKE 'demo-claim-%');
      DELETE FROM claims WHERE tx_signature LIKE 'demo-claim-%';
      DELETE FROM token_chain_state WHERE mint LIKE '%Demo%';
      DELETE FROM tokens WHERE mint LIKE '%Demo%';
      DELETE FROM recipients
        WHERE NOT EXISTS (SELECT 1 FROM tokens t WHERE t.recipient_handle=recipients.handle)
          AND NOT EXISTS (SELECT 1 FROM payouts p WHERE p.recipient_handle=recipients.handle);
    `);
    db.exec('COMMIT');
  } catch(e){db.exec('ROLLBACK');throw e;}
}

export function resetDatabase() {
  db.exec(`DELETE FROM payout_items; DELETE FROM payouts; DELETE FROM buybacks; DELETE FROM exchange_orders; DELETE FROM claims; DELETE FROM token_chain_state; DELETE FROM tokens; DELETE FROM recipients; DELETE FROM launch_intents; DELETE FROM webhook_events; DELETE FROM indexer_state; DELETE FROM oauth_states;`);
}
