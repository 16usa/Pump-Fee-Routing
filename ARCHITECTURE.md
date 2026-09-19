# Architecture

```text
pump.fun / Solana
      │
      ├─ Pump Fees SharingConfig discovery / single-mint verification
      │
      ▼
 token registry ───────────────► Explore / token / profile API
      │
      ▼
 permissionless fee distribution (claim worker)
      │
      ▼
 confirmed claim ──► 80% recipient credit ──► milestone scheduler ──► payout adapter
      │                                              │
      └────────────► 20% protocol cut                └─► payout webhook / receipt
                           │
                           └─► buyback ledger / future execution adapter

Treasury claim accounting ──► optional exchange orders ──► Capital Flow / Money

X OAuth2 PKCE ──► authenticated handle ──► opt-out state
```

## Trust boundaries

- Creator wallet: stays client-side and signs creator-authority fee-sharing changes.
- Crank key: optional server-owned fee payer for permissionless distribution only.
- Treasury: public address is configured; no treasury secret is required by the claim path.
- Exchange/payout secrets: server-side environment only.
- Public API: read operations plus launch intent/verification.
- Admin API: bearer-token protected.
- Webhooks: separate shared secret.
