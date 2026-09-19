# PROJECT full-stack routing clone — v1

A from-scratch full-stack implementation of the public product flow shown in the supplied UsePaid screenshots/PDF and its public documentation, with original code and your own configurable branding/integrations.

This is **not** the earlier UI-only starter. The browser now reads from a real backend and persistent ledger.

## What is implemented

### Public product
- Responsive dark UI: Home, Explore, Money, token pages, profile pages, Capital Flow, Protocol, Docs, Legal, Launch and Opt-out.
- Explore search and sorting come from `/api/tokens`, not a static JS array.
- Token `Sent` and `Owed` values are calculated from confirmed claims and payout allocation records.
- Profile totals and recent payments are calculated from the ledger.
- Token detail pages show claims and payout history.

### Backend + database
- Node 22 HTTP server.
- SQLite persistence via Node's built-in `node:sqlite`.
- Tables for recipients, tokens, claims, payouts, payout items, protocol-cut/buyback entries, exchange orders, launch intents, webhooks, OAuth state and indexer state.
- Idempotent claim recording by on-chain transaction signature.
- Payout allocation to the token balances that produced the recipient credit.

### pump.fun / Solana
- Uses the public `@pump-fun/pump-sdk` and Solana Web3 SDK.
- Verifies a mint's fee-sharing config on chain.
- A token is accepted as payable only when the configured treasury is the sole shareholder at `10,000 bps` and the config is permanent (`adminRevoked`).
- Optional on-chain discovery scans Pump Fees `SharingConfig` accounts.
- Claim worker calls Pump's permissionless creator-fee distribution flow.
- In `LIVE_CHAIN_TRANSACTIONS=false`, claim runs are dry-runs and never sign/send.
- In live mode, a dedicated **server-owned crank key** pays transaction fees and sends permissionless distribution transactions. It is not an end-user key.
- Confirmed treasury balance increase is written as the gross claim amount.
- SOL/USD is read from Kraken's public ticker for accounting.

### Launch / fee routing
- Creates a launch intent and exact recipient metadata line.
- Browser can connect an injected Solana wallet such as Phantom.
- Backend builds the Pump fee-sharing transaction to route `100%` to your treasury and make the sharing config permanent.
- The creator wallet signs the transaction in the browser; the server does not receive the creator's private key.
- The mint can then be verified and registered on chain.

### Accounting / payouts
- Default `80%` recipient / `20%` protocol cut, configurable by BPS env variables.
- Recipient payout milestones: `$5 → $10 → $20 → $50 → $100 → $250 → $500 → $1,000 → every next $1,000`.
- Manual payout provider for reconciliation.
- Generic HTTP payout provider adapter for an authorized payout gateway.
- Payout webhook to confirm `sent/claimed` state and public confirmation URL.
- Opt-out makes a handle non-payable, hides its tokens, and moves unpaid accounting to protocol-cut/buyback accounting.

### X OAuth
- OAuth2 PKCE flow is included for verified opt-out.
- Requires your own X developer application credentials.
- The flow reads the authenticated account and then applies opt-out to that handle.

### Kraken
- Public SOL/USD pricing works without credentials.
- A Kraken market-sell adapter is included behind both:
  - `EXCHANGE_PROVIDER=kraken`
  - `KRAKEN_LIVE_TRADING=true`
- Live trading is **off by default**.
- The adapter assumes the Kraken account already has the asset available. Treasury-to-exchange deposits are intentionally not automated by this project.

## Important external limitation

The public website does not expose somebody else's private X Money account/API, treasury key, exchange credentials, banking credentials, or internal service code. This project therefore connects to **your own** treasury and provider accounts.

X Money does not have a public payout API wired into this repository. `PAYOUT_PROVIDER=http` is the integration point for an authorized payout gateway/API you control. Do not put another service's credentials into the project.

## Replit install — existing workspace

Upload `route-fullstack-v1.zip`, then run in your existing Shell:

```sh
unzip -o route-fullstack-v1.zip -d .
npm install
cp -n .env.example .env
npm run check
```

There is deliberately **no restart command**. After editing `.env`, restart/run the project yourself from the Replit console.

The server uses `PORT` automatically; default is `3000` if Replit does not provide one.

`runtime.config.json` contains the checked-in operating mode. The current
configuration is read-only: real on-chain discovery is enabled while demo
seeding, claim workers, payout workers, live chain transactions, and Kraken
trading are disabled. RPC credentials and the treasury address remain in
Replit Secrets/environment variables and are never written to that file.

In read-only mode, discovery queries Pump Fees sharing-config accounts with
server-side filters for the configured treasury, then decodes and verifies
each result from chain. A token is indexed only when the treasury is the sole
shareholder at `10,000 bps` and `adminRevoked` is true. Current distributable
creator fees are read by transaction simulation without signing or submitting
a transaction and persisted in `token_chain_state`.

`Owed` includes the recipient share of confirmed claims plus the recipient
share of the latest real on-chain distributable balance, less confirmed
payouts. `Sent` includes confirmed real payouts only. If no matching sharing
configurations or payouts exist, the corresponding lists and totals remain
empty or zero; the app does not insert placeholders.

## First configuration

Edit `.env` and set at minimum:

```env
APP_NAME=YOUR_PROJECT_NAME
APP_MARK=Y
ADMIN_TOKEN=use-a-long-random-value
WEBHOOK_SECRET=use-another-long-random-value
SOLANA_RPC_URL=https://YOUR_RPC
TREASURY_ADDRESS=YOUR_SOLANA_TREASURY_PUBLIC_KEY
SEED_DEMO=false
```

For the first real test, keep:

```env
LIVE_CHAIN_TRANSACTIONS=false
ONCHAIN_DISCOVERY_ENABLED=false
PAYOUT_PROVIDER=manual
EXCHANGE_PROVIDER=disabled
KRAKEN_LIVE_TRADING=false
```

This gives you real on-chain **verification** with no automatic money movement.

## Enabling automatic discovery

Once your RPC allows `getProgramAccounts` on the Pump Fees program:

```env
ONCHAIN_DISCOVERY_ENABLED=true
DISCOVERY_INTERVAL_MS=300000
```

You can also register/verify one mint immediately from the Launch page or API without turning global discovery on.

## Enabling the permissionless claim crank

Use a separate low-balance fee-payer wallet for the crank. Do not use a user's wallet and do not expose its secret to the browser.

```env
LIVE_CHAIN_TRANSACTIONS=true
CRANK_SECRET_KEY_JSON=[...64 keypair bytes...]
```

The treasury can remain a separate address. Keeping crank and treasury separate makes post-transaction treasury balance accounting cleaner.

## Payout provider

### Manual mode

```env
PAYOUT_PROVIDER=manual
```

Milestone payouts enter `queued`. Confirm them through the admin API/webhook after you actually send them.

### HTTP provider

```env
PAYOUT_PROVIDER=http
PAYOUT_API_URL=https://your-authorized-gateway.example/payouts
PAYOUT_API_KEY=...
```

The server sends:

```json
{
  "id": "idempotency-id",
  "handle": "recipient",
  "amount_usd": 50.25
}
```

and expects JSON containing a provider `id/reference` and optionally a `status`.

## X verified opt-out

Configure an X developer application and callback URL:

```env
X_CLIENT_ID=...
X_CLIENT_SECRET=...
X_REDIRECT_URI=https://YOUR-DOMAIN/api/auth/x/callback
```

Then `/#/opt-out` uses X sign-in and opts out the authenticated handle.

## Internal operations

Open:

```text
/#/admin
```

Enter `ADMIN_TOKEN` to run discovery, claims, or payouts manually. This route is intentionally not linked in public navigation.

Useful API checks:

```sh
curl http://127.0.0.1:$PORT/api/health
curl http://127.0.0.1:$PORT/api/tokens
curl http://127.0.0.1:$PORT/api/money
```

Manual worker call:

```sh
curl -X POST http://127.0.0.1:$PORT/api/admin/run/discovery \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{}'
```

## Demo data

`SEED_DEMO=true` seeds illustrative rows only when the database is empty. For a real deployment use:

```env
SEED_DEMO=false
```

To clear the local database and re-apply the current seed setting:

```sh
npm run seed:reset
```

## Production checklist before enabling money movement

1. Use a private/reliable Solana RPC with rate limits appropriate for `getProgramAccounts` and transaction submission.
2. Set `SEED_DEMO=false` and reset the DB.
3. Use a separate server-owned crank wallet with only enough SOL for transaction fees.
4. Back up `data/app.db` or move the database to durable storage.
5. Put all secrets in Replit Secrets/environment variables, not source files.
6. Keep live chain transactions and Kraken trading off until dry-run results match on-chain state.
7. Reconcile every external payout through the payout webhook/provider reference.
8. Replace placeholder Terms/Legal copy with reviewed project-specific documents.
9. Add provider-specific compliance/KYC controls required by the payout rail you actually use.
10. Put the app behind HTTPS before OAuth or production webhooks.

## Main files

```text
server.js               HTTP/static server
server/db.js            SQLite schema + ledger writes
server/queries.js       Explore/Money/Profile projections
server/solana.js        pump.fun verify/discovery/claims/launch tx
server/payouts.js       payout milestones + provider adapter
server/kraken.js        optional Kraken market-sell adapter
server/xoauth.js        X OAuth2 PKCE opt-out identity check
server/workers.js       discovery/claim/payout schedulers
server/api.js           JSON API + admin/webhook routes
src/app.js              public web application
src/styles.css          responsive design
```
