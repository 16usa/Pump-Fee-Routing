import fs from 'node:fs';
import path from 'node:path';

function loadDotEnv(file = '.env') {
  const p = path.resolve(file);
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv();

function loadRuntimeConfig(file = 'runtime.config.json') {
  const p=path.resolve(file);
  if(!fs.existsSync(p)) return {};
  try{return JSON.parse(fs.readFileSync(p,'utf8'));}
  catch(e){throw new Error(`Invalid ${file}: ${e.message}`);}
}
const runtimeConfig=loadRuntimeConfig();
const setting=(name,fallback)=>Object.prototype.hasOwnProperty.call(runtimeConfig,name)?runtimeConfig[name]:(process.env[name]??fallback);
const bool = (name, fallback = false) => {
  const v = setting(name, fallback);
  if(typeof v==='boolean')return v;
  if (v == null || v === '') return fallback;
  return /^(1|true|yes|on)$/i.test(v);
};
const num = (name, fallback) => {
  const n = Number(setting(name, fallback));
  return Number.isFinite(n) ? n : fallback;
};

export const config = Object.freeze({
  port: num('PORT', 3000),
  appName: process.env.APP_NAME || 'PROJECT',
  appMark: process.env.APP_MARK || 'P',
  appBaseUrl: process.env.APP_BASE_URL || `http://localhost:${num('PORT', 3000)}`,
  seedDemo: bool('SEED_DEMO', false),
  adminToken: process.env.ADMIN_TOKEN || '',
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  treasuryAddress: process.env.TREASURY_ADDRESS || '',
  crankSecretKeyJson: process.env.CRANK_SECRET_KEY_JSON || '',
  liveChainTransactions: bool('LIVE_CHAIN_TRANSACTIONS', false),
  readOnlyMode: bool('READ_ONLY_MODE', true),
  onchainDiscoveryEnabled: bool('ONCHAIN_DISCOVERY_ENABLED', false),
  claimWorkerEnabled: bool('CLAIM_WORKER_ENABLED', false),
  payoutWorkerEnabled: bool('PAYOUT_WORKER_ENABLED', false),
  discoveryIntervalMs: num('DISCOVERY_INTERVAL_MS', 300000),
  claimIntervalMs: num('CLAIM_INTERVAL_MS', 180000),
  payoutIntervalMs: num('PAYOUT_INTERVAL_MS', 60000),
  pumpMetadataUrlTemplate: process.env.PUMP_METADATA_URL_TEMPLATE || 'https://frontend-api-v3.pump.fun/coins/{mint}',
  recipientShareBps: num('RECIPIENT_SHARE_BPS', 8000),
  protocolShareBps: num('PROTOCOL_SHARE_BPS', 2000),
  payoutProvider: setting('PAYOUT_PROVIDER', 'manual') || 'manual',
  payoutApiUrl: process.env.PAYOUT_API_URL || '',
  payoutApiKey: process.env.PAYOUT_API_KEY || '',
  xClientId: process.env.X_CLIENT_ID || '',
  xClientSecret: process.env.X_CLIENT_SECRET || '',
  xRedirectUri: process.env.X_REDIRECT_URI || '',
  exchangeProvider: setting('EXCHANGE_PROVIDER', 'disabled') || 'disabled',
  krakenApiKey: process.env.KRAKEN_API_KEY || '',
  krakenApiSecret: process.env.KRAKEN_API_SECRET || '',
  krakenLiveTrading: bool('KRAKEN_LIVE_TRADING', false),
});

if (config.recipientShareBps + config.protocolShareBps !== 10000) {
  throw new Error('RECIPIENT_SHARE_BPS + PROTOCOL_SHARE_BPS must equal 10000');
}
