import { randomBytes } from 'node:crypto';
import {
  createPublicClient,
  decodeEventLog,
  encodeFunctionData,
  formatEther,
  getAddress,
  http,
  isAddress,
  zeroAddress,
  defineChain,
} from 'viem';
import { config } from './config.js';
import { db, recordClaim, setIndexerState, upsertToken } from './db.js';

export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_CHAIN_HEX = '0x1237';
export const DEFAULT_PONS_V2_FACTORY = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e';
export const DEFAULT_PONS_V2_HOOK = '0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044';
export const DEFAULT_PONS_V2_FEE_ESCROW = '0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e';

const robinhoodChain = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Robinhood Chain Explorer', url: 'https://robinhoodchain.blockscout.com' } },
});

const FACTORY_ABI = [
  {
    type: 'function', name: 'canLaunch', stateMutability: 'view',
    inputs: [{ name: 'launcher', type: 'address' }], outputs: [{ type: 'bool' }],
  },
  { type: 'function', name: 'launchEnabled', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'launchFee', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'maxCreatorTaxBps', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'launchConfigCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'getLaunchConfig', stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{
      name: '', type: 'tuple', components: [
        { name: 'supply', type: 'uint256' },
        { name: 'curveFeeBps', type: 'uint256' },
        { name: 'phantomQuote', type: 'uint256' },
        { name: 'graduationThreshold', type: 'uint256' },
        { name: 'poolFee', type: 'uint24' },
        { name: 'tickSpacing', type: 'int24' },
        { name: 'enabled', type: 'bool' },
      ],
    }],
  },
  {
    type: 'function', name: 'previewLaunchEconomics', stateMutability: 'view',
    inputs: [{ name: 'launchConfigId', type: 'uint256' }, { name: 'pairToken', type: 'address' }],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'function', name: 'getLaunchedToken', stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{
      name: '', type: 'tuple', components: [
        { name: 'token', type: 'address' },
        { name: 'curve', type: 'address' },
        { name: 'deployer', type: 'address' },
        { name: 'creatorFeeRecipient', type: 'address' },
        { name: 'pairToken', type: 'address' },
        { name: 'graduationThreshold', type: 'uint256' },
        { name: 'poolFee', type: 'uint24' },
        { name: 'tickSpacing', type: 'int24' },
        { name: 'creatorTaxBps', type: 'uint16' },
        { name: 'buybackEnabled', type: 'bool' },
        { name: 'phase', type: 'uint8' },
        { name: 'sweptQuote', type: 'uint256' },
        { name: 'sweptTokens', type: 'uint256' },
        { name: 'sweptAt', type: 'uint256' },
        { name: 'exists', type: 'bool' },
      ],
    }],
  },
  {
    type: 'function', name: 'launchToken', stateMutability: 'payable',
    inputs: [
      {
        name: 'params', type: 'tuple', components: [
          { name: 'name', type: 'string' },
          { name: 'symbol', type: 'string' },
          { name: 'logo', type: 'string' },
          { name: 'description', type: 'string' },
          {
            name: 'socials', type: 'tuple', components: [
              { name: 'twitter', type: 'string' },
              { name: 'telegram', type: 'string' },
              { name: 'discord', type: 'string' },
              { name: 'website', type: 'string' },
              { name: 'farcaster', type: 'string' },
            ],
          },
          { name: 'creatorFeeRecipient', type: 'address' },
          { name: 'creatorTaxBps', type: 'uint16' },
          { name: 'buybackEnabled', type: 'bool' },
          { name: 'expectedEconomics', type: 'bytes32' },
          { name: 'salt', type: 'bytes32' },
        ],
      },
      { name: 'launchConfigId', type: 'uint256' },
      { name: 'pairToken', type: 'address' },
    ],
    outputs: [{ name: 'token', type: 'address' }, { name: 'curve', type: 'address' }],
  },
  {
    type: 'event', name: 'TokenLaunched', anonymous: false,
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'curve', type: 'address', indexed: true },
      { name: 'deployer', type: 'address', indexed: true },
      { name: 'pairToken', type: 'address', indexed: false },
      { name: 'launchConfigId', type: 'uint256', indexed: false },
      { name: 'graduationThreshold', type: 'uint256', indexed: false },
    ],
  },
];

const TOKEN_ABI = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'logo', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'description', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  {
    type: 'function', name: 'socials', stateMutability: 'view', inputs: [], outputs: [
      { name: 'twitter', type: 'string' }, { name: 'telegram', type: 'string' },
      { name: 'discord', type: 'string' }, { name: 'website', type: 'string' }, { name: 'farcaster', type: 'string' },
    ],
  },
];

const CURVE_ABI = [
  {
    type: 'event', name: 'FeesSwept', anonymous: false,
    inputs: [
      { name: 'protocolAmount', type: 'uint256', indexed: false },
      { name: 'buybackAmount', type: 'uint256', indexed: false },
      { name: 'creatorAmount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event', name: 'FeesRescued', anonymous: false,
    inputs: [
      { name: 'protocolRecipient', type: 'address', indexed: true },
      { name: 'creatorRecipient', type: 'address', indexed: true },
      { name: 'protocolAmount', type: 'uint256', indexed: false },
      { name: 'creatorAmount', type: 'uint256', indexed: false },
    ],
  },
];

const HOOK_ABI = [
  {
    type: 'function', name: 'launches', stateMutability: 'view', inputs: [{ name: '', type: 'bytes32' }],
    outputs: [
      { name: 'registered', type: 'bool' },
      { name: 'memecoinIsCurrency0', type: 'bool' },
      { name: 'memecoin', type: 'address' },
      { name: 'quoteToken', type: 'address' },
      { name: 'creator', type: 'address' },
      { name: 'buybackCreatorRecipient', type: 'address' },
      { name: 'protocolFeeRecipient', type: 'address' },
      { name: 'creatorTaxBps', type: 'uint16' },
      { name: 'protocolFeeShareBps', type: 'uint16' },
      { name: 'buybackBurnBps', type: 'uint16' },
      { name: 'hookFeeBps', type: 'uint16' },
      { name: 'maxInternalPriceImpactBps', type: 'uint16' },
      { name: 'buybackEnabled', type: 'bool' },
    ],
  },
  {
    type: 'event', name: 'PoolFeesSwept', anonymous: false,
    inputs: [
      { name: 'poolId', type: 'bytes32', indexed: true },
      { name: 'protocolAmount', type: 'uint256', indexed: false },
      { name: 'buybackAmount', type: 'uint256', indexed: false },
      { name: 'creatorAmount', type: 'uint256', indexed: false },
      { name: 'tokensLocked', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event', name: 'PoolFeesRescued', anonymous: false,
    inputs: [
      { name: 'poolId', type: 'bytes32', indexed: true },
      { name: 'quoteToken', type: 'address', indexed: true },
      { name: 'protocolAmount', type: 'uint256', indexed: false },
      { name: 'creatorAmount', type: 'uint256', indexed: false },
    ],
  },
];

const ESCROW_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'recipient', type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const byteLen = (value) => Buffer.byteLength(String(value || ''), 'utf8');
const eq = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
const asAddress = (value, label) => {
  const raw = String(value || '').trim();
  if (!isAddress(raw)) throw new Error(`${label} is not a valid EVM address`);
  return getAddress(raw);
};
const ponsFactory = () => asAddress(config.ponsFactoryAddress || DEFAULT_PONS_V2_FACTORY, 'Pons V2 factory');
const ponsHook = () => asAddress(config.ponsHookAddress || DEFAULT_PONS_V2_HOOK, 'Pons V2 hook');
const ponsEscrow = () => asAddress(config.ponsFeeEscrowAddress || DEFAULT_PONS_V2_FEE_ESCROW, 'Pons V2 fee escrow');
const ponsTreasury = () => asAddress(config.ponsTreasuryAddress, 'PONS_TREASURY_ADDRESS');

function client() {
  return createPublicClient({
    chain: robinhoodChain,
    transport: http(config.ponsRpcUrl || 'https://rpc.mainnet.chain.robinhood.com', { timeout: 15_000 }),
  });
}

function parseMetadata(row) {
  try { return JSON.parse(row?.metadata_json || '{}') || {}; } catch { return {}; }
}

function indexerValue(key) {
  return db.prepare('SELECT value FROM indexer_state WHERE key=?').get(key)?.value ?? null;
}

function setCursor(key, blockNumber) {
  setIndexerState(key, String(blockNumber));
}

function getCursor(key, fallback) {
  const raw = indexerValue(key);
  if (raw == null || raw === '') return BigInt(fallback);
  try { return BigInt(raw); } catch { return BigInt(fallback); }
}

async function firstEnabledLaunchConfig(publicClient) {
  const countRaw = await publicClient.readContract({ address: ponsFactory(), abi: FACTORY_ABI, functionName: 'launchConfigCount' });
  const count = Number(countRaw);
  const max = Math.min(count, 64);
  for (let id = 0; id < max; id++) {
    const cfg = await publicClient.readContract({ address: ponsFactory(), abi: FACTORY_ABI, functionName: 'getLaunchConfig', args: [BigInt(id)] });
    if (cfg?.enabled) return { id, config: cfg };
  }
  return null;
}

export async function getPonsStatus(wallet = '') {
  const enabled = Boolean(config.ponsEnabled);
  const configured = enabled && Boolean(config.ponsTreasuryAddress) && isAddress(String(config.ponsTreasuryAddress || ''));
  const base = {
    enabled,
    configured,
    chainId: ROBINHOOD_CHAIN_ID,
    chainIdHex: ROBINHOOD_CHAIN_HEX,
    chainName: 'Robinhood Chain',
    rpcUrl: config.ponsRpcUrl || 'https://rpc.mainnet.chain.robinhood.com',
    explorerUrl: config.ponsExplorerUrl || 'https://robinhoodchain.blockscout.com',
    factory: config.ponsFactoryAddress || DEFAULT_PONS_V2_FACTORY,
    hook: config.ponsHookAddress || DEFAULT_PONS_V2_HOOK,
    feeEscrow: config.ponsFeeEscrowAddress || DEFAULT_PONS_V2_FEE_ESCROW,
    treasuryAddress: config.ponsTreasuryAddress || '',
    generation: 'v2',
    launchRestriction: 'Pons V2 currently gates launchToken with canLaunch(wallet).',
  };
  if (!configured) return base;

  const publicClient = client();
  const calls = [
    publicClient.readContract({ address: ponsFactory(), abi: FACTORY_ABI, functionName: 'launchEnabled' }),
    publicClient.readContract({ address: ponsFactory(), abi: FACTORY_ABI, functionName: 'launchFee' }),
    publicClient.readContract({ address: ponsFactory(), abi: FACTORY_ABI, functionName: 'maxCreatorTaxBps' }),
    publicClient.readContract({ address: ponsEscrow(), abi: ESCROW_ABI, functionName: 'balanceOf', args: [ponsTreasury()] }),
    firstEnabledLaunchConfig(publicClient),
  ];
  if (wallet && isAddress(wallet)) {
    calls.push(publicClient.readContract({ address: ponsFactory(), abi: FACTORY_ABI, functionName: 'canLaunch', args: [getAddress(wallet)] }));
  }
  const [launchEnabled, launchFee, maxCreatorTaxBps, escrowBalance, selectedConfig, canLaunch] = await Promise.all(calls);
  return {
    ...base,
    launchEnabled: Boolean(launchEnabled),
    launchFeeWei: String(launchFee),
    launchFeeEth: formatEther(launchFee),
    maxCreatorTaxBps: Number(maxCreatorTaxBps),
    escrowClaimableWei: String(escrowBalance),
    escrowClaimableEth: formatEther(escrowBalance),
    launchConfigId: selectedConfig?.id ?? null,
    canLaunch: wallet && isAddress(wallet) ? Boolean(canLaunch) : null,
  };
}

function validatePonsMetadata({ name, symbol, logo, description, socials = {} }) {
  if (!String(name || '').trim() || byteLen(name) > 64) throw new Error('Pons token name must be 1-64 UTF-8 bytes');
  if (!String(symbol || '').trim() || byteLen(symbol) > 16) throw new Error('Pons ticker must be 1-16 UTF-8 bytes');
  if (!String(logo || '').trim() || byteLen(logo) > 512) throw new Error('Pons logo URL must be 1-512 UTF-8 bytes');
  if (byteLen(description) > 2048) throw new Error('Pons description must be 2048 UTF-8 bytes or fewer');
  for (const [key, value] of Object.entries(socials)) {
    if (byteLen(value) > 256) throw new Error(`Pons ${key} value must be 256 UTF-8 bytes or fewer`);
  }
}

export async function buildPonsLaunchTransaction({ from, name, symbol, logo, description = '', socials = {} }) {
  if (!config.ponsEnabled) throw new Error('Pons launch is disabled');
  const sender = asAddress(from, 'Creator wallet');
  const treasury = ponsTreasury();
  validatePonsMetadata({ name, symbol, logo, description, socials });

  const publicClient = client();
  const [allowed, launchEnabled, launchFee, selected] = await Promise.all([
    publicClient.readContract({ address: ponsFactory(), abi: FACTORY_ABI, functionName: 'canLaunch', args: [sender] }),
    publicClient.readContract({ address: ponsFactory(), abi: FACTORY_ABI, functionName: 'launchEnabled' }),
    publicClient.readContract({ address: ponsFactory(), abi: FACTORY_ABI, functionName: 'launchFee' }),
    firstEnabledLaunchConfig(publicClient),
  ]);
  if (!launchEnabled) throw new Error('Pons V2 launch is disabled by the launchpad');
  if (!allowed) throw Object.assign(new Error('This wallet is not currently allowed by Pons V2 canLaunch(). Pons controls the launch whitelist.'), { statusCode: 409 });
  if (!selected) throw new Error('Pons V2 has no enabled launch configuration');

  const expectedEconomics = await publicClient.readContract({
    address: ponsFactory(), abi: FACTORY_ABI, functionName: 'previewLaunchEconomics',
    args: [BigInt(selected.id), zeroAddress],
  });
  const salt = `0x${randomBytes(32).toString('hex')}`;
  const params = {
    name: String(name).trim(),
    symbol: String(symbol).trim().toUpperCase(),
    logo: String(logo).trim(),
    description: String(description || ''),
    socials: {
      twitter: String(socials.twitter || ''),
      telegram: String(socials.telegram || ''),
      discord: String(socials.discord || ''),
      website: String(socials.website || ''),
      farcaster: String(socials.farcaster || ''),
    },
    creatorFeeRecipient: treasury,
    creatorTaxBps: 0,
    buybackEnabled: false,
    expectedEconomics,
    salt,
  };
  const data = encodeFunctionData({
    abi: FACTORY_ABI,
    functionName: 'launchToken',
    args: [params, BigInt(selected.id), zeroAddress],
  });
  return {
    ok: true,
    chainId: ROBINHOOD_CHAIN_ID,
    chainIdHex: ROBINHOOD_CHAIN_HEX,
    to: ponsFactory(),
    from: sender,
    data,
    value: `0x${BigInt(launchFee).toString(16)}`,
    launchFeeWei: String(launchFee),
    launchFeeEth: formatEther(launchFee),
    launchConfigId: selected.id,
    creatorFeeRecipient: treasury,
    creatorTaxBps: 0,
    buybackEnabled: false,
    pairToken: zeroAddress,
    expectedEconomics,
    salt,
  };
}

async function readTokenMetadata(publicClient, token) {
  const [name, symbol, logo, description, socials] = await Promise.all([
    publicClient.readContract({ address: token, abi: TOKEN_ABI, functionName: 'name' }),
    publicClient.readContract({ address: token, abi: TOKEN_ABI, functionName: 'symbol' }),
    publicClient.readContract({ address: token, abi: TOKEN_ABI, functionName: 'logo' }),
    publicClient.readContract({ address: token, abi: TOKEN_ABI, functionName: 'description' }),
    publicClient.readContract({ address: token, abi: TOKEN_ABI, functionName: 'socials' }),
  ]);
  return {
    name, symbol, logo, description,
    socials: { twitter: socials[0], telegram: socials[1], discord: socials[2], website: socials[3], farcaster: socials[4] },
  };
}

export async function verifyAndRegisterPonsToken(token, { recipientHandle, txHash = '', launchBlock = null, expectedCurve = '' } = {}) {
  if (!config.ponsEnabled) throw new Error('Pons integration is disabled');
  const tokenAddress = asAddress(token, 'Pons token');
  const handle = String(recipientHandle || '').replace(/^@/, '').trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new Error('Valid X recipient handle required for Pons registration');
  const publicClient = client();
  const launch = await publicClient.readContract({ address: ponsFactory(), abi: FACTORY_ABI, functionName: 'getLaunchedToken', args: [tokenAddress] });
  if (!launch?.exists) throw new Error('Token is not registered in the Pons V2 factory');
  if (!eq(launch.creatorFeeRecipient, ponsTreasury())) throw new Error('Pons creator fee recipient does not match PONS_TREASURY_ADDRESS');
  if (!eq(launch.pairToken, zeroAddress)) throw new Error('This PROJECT release accepts only native-ETH Pons V2 launches');
  if (expectedCurve && !eq(launch.curve, expectedCurve)) throw new Error('Pons launch curve does not match the transaction event');

  const meta = await readTokenMetadata(publicClient, tokenAddress);
  let createdAt = null;
  if (launchBlock != null) {
    try {
      const block = await publicClient.getBlock({ blockNumber: BigInt(launchBlock) });
      createdAt = new Date(Number(block.timestamp) * 1000).toISOString();
    } catch {}
  }
  const blockNumber = launchBlock == null ? null : Number(launchBlock);
  upsertToken({
    mint: tokenAddress,
    venue: 'pons',
    name: meta.name,
    symbol: meta.symbol,
    image_url: meta.logo,
    description: meta.description,
    recipient_handle: handle,
    recipient_source: 'launch-intent',
    market_cap_usd: 0,
    fee_share_bps: 10000,
    permanent: true,
    hidden: false,
    fee_config_address: launch.curve,
    created_at: createdAt,
    metadata: {
      chain: 'robinhood', chainId: ROBINHOOD_CHAIN_ID, generation: 'v2',
      factory: ponsFactory(), hook: ponsHook(), feeEscrow: ponsEscrow(),
      curve: launch.curve, deployer: launch.deployer, creatorFeeRecipient: launch.creatorFeeRecipient,
      pairToken: launch.pairToken, launchBlock: blockNumber, txHash,
      creatorTaxBps: Number(launch.creatorTaxBps || 0), buybackEnabled: Boolean(launch.buybackEnabled),
      socials: meta.socials,
    },
  });

  if (blockNumber != null) {
    const curveKey = `pons_curve_cursor:${tokenAddress.toLowerCase()}`;
    const desired = Math.max(0, blockNumber - 1);
    const current = indexerValue(curveKey);
    if (current == null || BigInt(current) > BigInt(desired)) setCursor(curveKey, desired);
    const hookKey = `pons_hook_cursor:${ponsHook().toLowerCase()}`;
    const hookCurrent = indexerValue(hookKey);
    if (hookCurrent == null || BigInt(hookCurrent) > BigInt(desired)) setCursor(hookKey, desired);
  }
  return {
    ok: true,
    token: tokenAddress,
    mint: tokenAddress,
    curve: launch.curve,
    recipient: handle,
    creatorFeeRecipient: launch.creatorFeeRecipient,
    chain: 'robinhood',
    chainId: ROBINHOOD_CHAIN_ID,
    venue: 'pons',
  };
}

export async function confirmPonsLaunch({ intentId, txHash }) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(txHash || ''))) throw Object.assign(new Error('Valid Pons transaction hash required'), { statusCode: 400 });
  const intent = db.prepare('SELECT * FROM launch_intents WHERE id=?').get(intentId || '');
  if (!intent) throw Object.assign(new Error('Launch intent not found'), { statusCode: 404 });
  const publicClient = client();
  let receipt;
  try { receipt = await publicClient.getTransactionReceipt({ hash: txHash }); }
  catch { throw Object.assign(new Error('Pons transaction is not confirmed yet'), { statusCode: 409 }); }
  if (receipt.status !== 'success') throw Object.assign(new Error('Pons launch transaction reverted'), { statusCode: 422 });

  let launched = null;
  for (const log of receipt.logs) {
    if (!eq(log.address, ponsFactory())) continue;
    try {
      const decoded = decodeEventLog({ abi: FACTORY_ABI, eventName: 'TokenLaunched', data: log.data, topics: log.topics });
      if (decoded?.eventName === 'TokenLaunched') { launched = decoded.args; break; }
    } catch {}
  }
  if (!launched?.token || !launched?.curve) throw new Error('Confirmed transaction did not emit Pons V2 TokenLaunched');
  const out = await verifyAndRegisterPonsToken(launched.token, {
    recipientHandle: intent.recipient_handle,
    txHash,
    launchBlock: receipt.blockNumber,
    expectedCurve: launched.curve,
  });
  db.prepare(`UPDATE launch_intents SET mint=?,status='registered',tx_signature=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(out.token, txHash, intent.id);
  return { ...out, txHash, blockNumber: Number(receipt.blockNumber) };
}

export async function fetchEthUsd() {
  try {
    const r = await fetch('https://api.kraken.com/0/public/Ticker?pair=ETHUSD', { signal: AbortSignal.timeout(10_000) });
    const j = await r.json();
    const row = Object.values(j.result || {})[0];
    const p = Number(row?.c?.[0]);
    if (p > 0) { setIndexerState('last_eth_usd', p); return p; }
  } catch (e) { console.warn(`[pons] ETH/USD price read failed: ${e.message}`); }
  const cached = Number(indexerValue('last_eth_usd') || 0);
  if (cached > 0) return cached;
  throw new Error('ETH/USD price is unavailable; refusing to ledger Pons fees without a price');
}

function recordPonsRevenue({ token, txHash, logIndex, amountWei, ethUsd, phase, eventName, blockNumber, extra = {} }) {
  const amount = BigInt(amountWei || 0);
  if (amount <= 0n) return null;
  const grossNative = Number(formatEther(amount));
  if (!(grossNative > 0)) return null;
  return recordClaim({
    mint: token,
    txSignature: `rh:${txHash}:${String(logIndex)}`,
    grossNative,
    nativeUsdPrice: ethUsd,
    chain: 'robinhood',
    nativeSymbol: 'ETH',
    raw: { venue: 'pons', generation: 'v2', phase, event: eventName, escrowed: true, blockNumber: Number(blockNumber), transactionHash: txHash, logIndex: Number(logIndex), ...extra },
  });
}

async function scanCurveFees(publicClient, row, latest, ethUsd, maxRange) {
  const meta = parseMetadata(row);
  if (!meta.curve || !isAddress(meta.curve)) return { token: row.mint, skipped: 'missing-curve' };
  if (!eq(meta.pairToken || zeroAddress, zeroAddress)) return { token: row.mint, skipped: 'non-native-quote' };
  const startFallback = Math.max(0, Number(meta.launchBlock || 0) - 1);
  const cursorKey = `pons_curve_cursor:${String(row.mint).toLowerCase()}`;
  let cursor = getCursor(cursorKey, startFallback);
  let scanned = 0, recorded = 0;
  while (cursor < latest) {
    const fromBlock = cursor + 1n;
    const toBlock = fromBlock + BigInt(maxRange - 1) > latest ? latest : fromBlock + BigInt(maxRange - 1);
    const [swept, rescued] = await Promise.all([
      publicClient.getContractEvents({ address: getAddress(meta.curve), abi: CURVE_ABI, eventName: 'FeesSwept', fromBlock, toBlock }),
      publicClient.getContractEvents({ address: getAddress(meta.curve), abi: CURVE_ABI, eventName: 'FeesRescued', fromBlock, toBlock }),
    ]);
    const logs = [...swept, ...rescued].sort((a, b) => Number(a.blockNumber - b.blockNumber) || Number(a.logIndex - b.logIndex));
    for (const log of logs) {
      if (log.eventName === 'FeesRescued' && !eq(log.args.creatorRecipient, ponsTreasury())) continue;
      const claim = recordPonsRevenue({
        token: row.mint,
        txHash: log.transactionHash,
        logIndex: log.logIndex,
        amountWei: log.args.creatorAmount,
        ethUsd,
        phase: 'curve',
        eventName: log.eventName,
        blockNumber: log.blockNumber,
        extra: { curve: meta.curve },
      });
      if (claim) recorded++;
    }
    cursor = toBlock;
    scanned += Number(toBlock - fromBlock + 1n);
    setCursor(cursorKey, cursor);
  }
  return { token: row.mint, scanned, recorded };
}

async function scanHookFees(publicClient, trackedRows, latest, ethUsd, maxRange) {
  if (!trackedRows.length) return { scanned: 0, recorded: 0 };
  const tracked = new Map(trackedRows.map(r => [String(r.mint).toLowerCase(), r]));
  const starts = trackedRows.map(r => Number(parseMetadata(r).launchBlock || 0)).filter(n => Number.isFinite(n) && n > 0);
  const fallback = Math.max(0, (starts.length ? Math.min(...starts) : Number(latest)) - 1);
  const hookAddress = ponsHook();
  const cursorKey = `pons_hook_cursor:${hookAddress.toLowerCase()}`;
  let cursor = getCursor(cursorKey, fallback);
  let scanned = 0, recorded = 0;
  const poolCache = new Map();
  while (cursor < latest) {
    const fromBlock = cursor + 1n;
    const toBlock = fromBlock + BigInt(maxRange - 1) > latest ? latest : fromBlock + BigInt(maxRange - 1);
    const [swept, rescued] = await Promise.all([
      publicClient.getContractEvents({ address: hookAddress, abi: HOOK_ABI, eventName: 'PoolFeesSwept', fromBlock, toBlock }),
      publicClient.getContractEvents({ address: hookAddress, abi: HOOK_ABI, eventName: 'PoolFeesRescued', fromBlock, toBlock }),
    ]);
    const logs = [...swept, ...rescued].sort((a, b) => Number(a.blockNumber - b.blockNumber) || Number(a.logIndex - b.logIndex));
    for (const log of logs) {
      const poolId = log.args.poolId;
      let info = poolCache.get(poolId);
      if (!info) {
        const raw = await publicClient.readContract({ address: hookAddress, abi: HOOK_ABI, functionName: 'launches', args: [poolId] });
        info = {
          registered: raw[0], memecoin: raw[2], quoteToken: raw[3],
          creator: raw[4], buybackCreatorRecipient: raw[5],
        };
        poolCache.set(poolId, info);
      }
      if (!info.registered || !eq(info.creator, ponsTreasury()) || !eq(info.quoteToken, zeroAddress)) continue;
      const row = tracked.get(String(info.memecoin || '').toLowerCase());
      if (!row) continue;
      if (log.eventName === 'PoolFeesRescued' && !eq(log.args.quoteToken, zeroAddress)) continue;
      const claim = recordPonsRevenue({
        token: row.mint,
        txHash: log.transactionHash,
        logIndex: log.logIndex,
        amountWei: log.args.creatorAmount,
        ethUsd,
        phase: 'pool',
        eventName: log.eventName,
        blockNumber: log.blockNumber,
        extra: { poolId, hook: hookAddress },
      });
      if (claim) recorded++;
    }
    cursor = toBlock;
    scanned += Number(toBlock - fromBlock + 1n);
    setCursor(cursorKey, cursor);
  }
  return { scanned, recorded };
}

export async function syncPonsFees() {
  if (!config.ponsEnabled) return { ok: true, skipped: 'disabled' };
  if (!config.ponsTreasuryAddress || !isAddress(String(config.ponsTreasuryAddress))) return { ok: true, skipped: 'treasury-not-configured' };
  const rows = db.prepare(`SELECT * FROM tokens WHERE venue='pons' AND hidden=0 AND COALESCE(opt_out_hidden,0)=0 ORDER BY discovered_at ASC`).all();
  if (!rows.length) return { ok: true, tokens: 0, recorded: 0 };
  const publicClient = client();
  const latest = await publicClient.getBlockNumber();
  const ethUsd = await fetchEthUsd();
  const maxRange = Math.max(100, Math.min(20_000, Number(config.ponsLogBlockRange || 5000)));
  let recorded = 0, scanned = 0, verified = 0;
  const eligible = [];

  for (const row of rows) {
    try {
      const launch = await publicClient.readContract({ address: ponsFactory(), abi: FACTORY_ABI, functionName: 'getLaunchedToken', args: [asAddress(row.mint, 'Pons token')] });
      if (!launch?.exists || !eq(launch.creatorFeeRecipient, ponsTreasury()) || !eq(launch.pairToken, zeroAddress)) continue;
      verified++;
      eligible.push(row);
      const out = await scanCurveFees(publicClient, row, latest, ethUsd, maxRange);
      recorded += Number(out.recorded || 0);
      scanned += Number(out.scanned || 0);
    } catch (e) {
      console.warn(`[pons] curve scan failed token=${row.mint}: ${e.message}`);
    }
  }
  try {
    const out = await scanHookFees(publicClient, eligible, latest, ethUsd, maxRange);
    recorded += Number(out.recorded || 0);
    scanned += Number(out.scanned || 0);
  } catch (e) {
    console.warn(`[pons] hook scan failed: ${e.message}`);
  }

  setIndexerState('pons_sync_status', 'ok');
  setIndexerState('pons_sync_block', latest);
  setIndexerState('pons_sync_at', new Date().toISOString());
  setIndexerState('pons_sync_recorded', recorded);
  return { ok: true, tokens: rows.length, verified, latestBlock: Number(latest), scannedBlocks: scanned, recorded, ethUsd };
}
