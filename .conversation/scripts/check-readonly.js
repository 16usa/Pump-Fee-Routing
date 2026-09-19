import { config } from '../server/config.js';
import { db, migrate, seedIfEmpty } from '../server/db.js';
import { claimMint, buildFeeRoutingTransaction } from '../server/solana.js';
import { processPayouts } from '../server/payouts.js';
import { sellSolUsd } from '../server/kraken.js';

const expected={
  readOnlyMode:true,
  seedDemo:false,
  onchainDiscoveryEnabled:true,
  claimWorkerEnabled:false,
  payoutWorkerEnabled:false,
  liveChainTransactions:false,
  krakenLiveTrading:false,
  payoutProvider:'manual',
  exchangeProvider:'disabled'
};
for(const [key,value] of Object.entries(expected)){
  if(config[key]!==value)throw new Error(`Unsafe read-only setting ${key}: expected ${value}, got ${config[key]}`);
}
if(!config.solanaRpcUrl||!config.treasuryAddress)throw new Error('SOLANA_RPC_URL and TREASURY_ADDRESS must be configured');

migrate();
seedIfEmpty();
const demoClaims=db.prepare(`SELECT COUNT(*) n FROM claims WHERE tx_signature LIKE 'demo-claim-%'`).get().n;
const demoPayouts=db.prepare(`SELECT COUNT(*) n FROM payouts WHERE provider='demo'`).get().n;
const demoTokens=db.prepare(`SELECT COUNT(*) n FROM tokens WHERE mint LIKE '%Demo%'`).get().n;
if(demoClaims||demoPayouts||demoTokens)throw new Error(`Demo records remain: tokens=${demoTokens} claims=${demoClaims} payouts=${demoPayouts}`);

const before={
  claims:db.prepare('SELECT COUNT(*) n FROM claims').get().n,
  payouts:db.prepare('SELECT COUNT(*) n FROM payouts').get().n,
  orders:db.prepare('SELECT COUNT(*) n FROM exchange_orders').get().n
};
const blocked=[
  ['claims',()=>claimMint('11111111111111111111111111111111')],
  ['fee routing',()=>buildFeeRoutingTransaction({mint:'x',creator:'x'})],
  ['payouts',()=>processPayouts()],
  ['Kraken trades',()=>sellSolUsd({volumeSol:1})]
];
for(const [name,fn] of blocked){
  try{await fn();throw new Error(`${name} was not blocked`);}
  catch(e){if(!String(e.message).startsWith('Read-only mode:'))throw e;}
}
const after={
  claims:db.prepare('SELECT COUNT(*) n FROM claims').get().n,
  payouts:db.prepare('SELECT COUNT(*) n FROM payouts').get().n,
  orders:db.prepare('SELECT COUNT(*) n FROM exchange_orders').get().n
};
if(JSON.stringify(before)!==JSON.stringify(after))throw new Error(`Read-only checks mutated accounting: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
console.log('Read-only safety checks OK', {demoTokens,demoClaims,demoPayouts,accountingUnchanged:true});