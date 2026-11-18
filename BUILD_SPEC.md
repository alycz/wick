# BUILD_SPEC.md — Wick: leveraged synthetic Gemini prediction markets on Solana devnet

> **For the coding agent (Codex).** You build and ship everything in this file, end to end, using subagents. No human writes code, reviews or tests. Read the whole file first. Section 12 is the work plan: which packages run in parallel, what each subagent gets, and when each is done. Every API fact here was checked against live endpoints on 2026-11-16; section 3 records what was seen. If a live response ever disagrees with this file, trust the live response, adapt the parser, and note it in `docs/FINDINGS.md`. Never fake or mock data in the shipped app.

Product name: **Wick** (a candle's wick is the tail move most venues don't quote; "getting wicked out" is trader slang for a liquidation). Pool token minted to losing traders: **$WICKED**. Keep both in one constant (`packages/shared/src/brand.ts`). Note: an unrelated app, wick.trade, exists; the UI and README always say "Wick" with the tagline, never "wick.trade", and use a distinct Vercel subdomain (e.g. `wick-markets.vercel.app`).

---

## 0. Mission and hard constraints

Build a Solana **devnet** app where users take **leveraged YES/NO positions on Gemini's live BTC prediction markets** against a **self-bootstrapping USDC liquidity pool** (Papertrade "Martingaler LP" model). Positions are priced at a **theoretical fair value ("theo") derived from Deribit's BTC option vol surface**, shown beside Gemini's own bid/ask. Markets settle on **Gemini's official outcome**.

Hackathon: UBC 2026 Hackathon. Track 02 (DeFi & Onchain Apps); chain award "Best use of Solana"; bounties "Gemini Prediction Markets" and "QuickNode Streams".

- **Deadline:** Devpost submission Fri Nov 20 2026, 12:00 PM CST. Aim for the full build deployed and verified by Thu Nov 19.
- **Solana devnet only.** Test USDC is our own 6-decimal SPL mint. No testnet, no mainnet, no real funds.
- **Originality:** the GitHub repo is created during hackathon week; implement the mechanics below yourself (don't copy Papertrade or other code).
- **Data access:** never use proxies or VPNs to get around a geo-block. Use the built-in fallbacks (section 5.3).
- **Judging:** technical execution, product & UX, innovation, impact, demo. Favor complete and working over broad and half-done.
- **Required by the official guide** (all must exist in the repo; section 11):
  - Track 02: interacts with smart contracts; README explains economic design and risk assumptions; lists every program address.
  - Solana award: core on-chain logic on Solana; Anchor; README gives program IDs and explains how Solana is used.
  - Gemini bounty: uses the Gemini Prediction Markets API (market data and/or trading endpoints both qualify; we use market data).
  - QuickNode bounty: Streams is a core data source; at least one Stream with a filter and a destination; README explains network, dataset, filter logic, destination, and why.
  - Submission: public repo with source and setup instructions; working deployed demo; 2–3 minute demo video; README with technical docs and an architecture overview; answers to: what you built, what problem it solves, how it works, what makes it unique, what you'd build next.

### Hosting stack ($0 for the hackathon)
| Piece | Where | Cost |
|---|---|---|
| Frontend | Vercel Hobby | $0 |
| Backend: one Node process (pricer + keeper + liquidator + settler + indexer webhook + read API) | Railway Trial ($5 one-time credit, 30 days, always on, no sleep) | $0; expected usage is about $1 for the week |
| Database | SQLite file (`better-sqlite3`) on a Railway volume mounted at `/data` | $0 |
| RPC + Streams | QuickNode free trial (Solana Streams follow the chain tip) | $0 |
| Chain | Solana devnet (airdropped SOL) | $0 |
| Market data | Gemini contract metadata and settlement, Deribit market data | $0 |
| Repo + CI | GitHub + GitHub Actions | $0 |

No Supabase, Render, Fly or separate database service. Keep the backend's RAM under 512 MB and its CPU light (batched writes, no busy loops) so it stays well inside the trial credit and would also fit Railway's smaller Free-plan limits.

### Credentials the agent receives (from the account holders, before start)
`GITHUB_TOKEN` + repo, `QUICKNODE_API_KEY` (dashboard + Streams REST API), a QuickNode Solana devnet endpoint URL, `RAILWAY_TOKEN` (a project token for a Railway project created on the Trial plan), `VERCEL_TOKEN`. If one is missing, build everything that doesn't need it, then list exactly what's missing in `docs/HANDOFF.md`. The account holders also upload the final video and press submit on Devpost; you produce the video file and the Devpost answers text (`docs/DEVPOST.md`).

---

## 1. Repository layout (pnpm monorepo)

```
/
├─ programs/wick/           # Anchor program (Rust)
├─ tests/                     # Anchor TS tests (localnet)
├─ packages/
│  ├─ shared/                 # types, fixed-point helpers, IDL client, constants, brand
│  ├─ pricing/                # pure TS pricing + risk math, no I/O (vitest)
│  ├─ gemini/                 # Gemini prediction-markets client + parsers (zod) + fixtures
│  └─ vol/                    # VolSource implementations: Deribit, Derive, Realized
├─ services/
│  └─ backend/                # ONE Node process, deployed to Railway
│     ├─ src/pricer/          # discovery, marks, keeper, liquidator, settler
│     ├─ src/indexer/         # QuickNode Streams webhook -> SQLite + read API
│     ├─ src/server.ts        # one Fastify server: pricer API + indexer API + webhook + SSE
│     └─ Dockerfile, railway.json
├─ app/                       # Next.js 14 App Router + Tailwind + TS + Solana wallet adapter
├─ scripts/                   # create-mint, deploy, init-config, airdrop, faucet, bots, demo-check, create-stream, record-demo
├─ streams/filter.js          # QuickNode Streams filter
└─ docs/ ARCHITECTURE.md, FINDINGS.md, DEMO.md, DEVPOST.md, HANDOFF.md
```

TypeScript strict everywhere. Pin the Anchor and Solana/Agave CLI versions you install (record them in the README, `Anchor.toml`, `rust-toolchain.toml`) and never upgrade mid-build. CI (GitHub Actions): lint, `vitest`, `anchor build`, `anchor test`.

---

## 2. Environment (`.env.example`)

```
SOLANA_CLUSTER=devnet
QUICKNODE_RPC_URL=
QUICKNODE_WSS_URL=
QUICKNODE_API_KEY=
KEEPER_KEYPAIR=               # base58 or path; devnet SOL only
PROGRAM_ID=
USDC_TEST_MINT=
FAUCET_AUTHORITY_KEYPAIR=

GEMINI_REST=https://api.gemini.com
GEMINI_WS=wss://ws.gemini.com
DERIBIT_REST=https://www.deribit.com/api/v2
DERIBIT_WS=wss://www.deribit.com/ws/api/v2
DERIVE_REST=https://api.derive.xyz/v3
VOL_SOURCE=auto               # auto | deribit | derive | realized

SQLITE_PATH=/data/wick.db   # Railway volume mount
STREAMS_WEBHOOK_SECRET=
RAILWAY_TOKEN=
VERCEL_TOKEN=

NEXT_PUBLIC_BACKEND_URL=      # the Railway service's public HTTPS domain
NEXT_PUBLIC_PROGRAM_ID=
NEXT_PUBLIC_USDC_TEST_MINT=
NEXT_PUBLIC_RPC_URL=
```

---

## 3. External data: what the live APIs return (checked 2026-11-16)

### 3.1 Gemini Prediction Markets (public REST, no key)

`GET https://api.gemini.com/v1/prediction-markets/events?status=active&search=BTC&limit=500&offset=0` returns `{ data: Event[], pagination: { limit, offset, total } }`. On 2026-11-16 it returned 24 active BTC events:

| Series (`event.series`) | `type` | Example ticker | What it is | Contracts |
|---|---|---|---|---|
| `BTC05M` | binary | `BTC05M2611162000` | 5-min Up/Down | 1 (`UP`) |
| `BTC15M` | binary | `BTC15M2611162030` | **15-min Up/Down (hero market)** | 1 (`UP`) |
| `BTC1H` | categorical | `BTC2611162000` ("BTC price today at 3pm EST") | hourly ladder | ~8 |
| `BTC1H` | categorical | `BTC2611162200` ("BTC price on November 16") | daily ladder, expires 22:00 UTC (5pm ET) | ~12, $250 steps |
| `BTC1H` | categorical | `BTC2611202200` ("BTC price on November 20") | weekly (Friday) ladder | ~21, $500 steps |
| `BTC` | categorical | `BTC2611302200` ("BTC price on November 30") | month-end ladder | ~12 |

Classify with `event.series`, `event.type`, `eventTags` (`Five Minute`, `Fifteen Minute`, `Up Down`, `Daily`, `Reference`) and the ticker. **Don't** rely on the series name alone for daily vs weekly vs hourly: use `expiryDate − now` and the title.

**Event fields used:** `id, ticker, title, type, series, status, startTime, effectiveDate, expiryDate, resolvedAt, settlement.value, sourceDetails.{agency,index}, eventTags[].name, contracts[]`.

**Contract fields used:** `id, ticker` (`UP` or `HI65000`), `instrumentSymbol` (`GEMI-BTC15M2611162030-UP`, `GEMI-BTC2611202200-HI65000`), `label`, `status`, `marketState` (`open|closed`), `effectiveDate`, `expiryDate`, `strike.{type,value,availableAt}`, `prices`, `priceIncrement` (0.01), `quantityMinimum` (0.01), `resolutionSide` (`yes|no`), `resolvedAt`, `settlementValue`, `termsAndConditionsUrl`.

**Prices object (live shape):**
```json
"prices": { "buy": { "yes": "0.66", "no": "0.44" }, "sell": { "yes": "0.56", "no": "0.34" },
            "bestBid": "0.56", "bestAsk": "0.66", "lastTradePrice": "0.37" }
```
`buy.yes` = best ask, `sell.yes` = best bid, `buy.no` = 1 − bestBid, `sell.no` = 1 − bestAsk. Any of these can be missing on a one-sided book: parse as optional decimals. Mid = (bestBid + bestAsk)/2 only when both exist.

**Up/Down strike lifecycle:** upcoming 15-min events are listed ahead of time. `strike` is `{type:"reference", value:null, availableAt:<startTime>}` until the window opens; then `value` is the captured price (e.g. `"64987.28"`). `GET /v1/prediction-markets/events/{eventTicker}/strike` returns the same.

**Ladder strikes:** `strike.type:"above"`, `strike.value` = the level. **"Above" is strict** (price > level). Treat as continuous for pricing.

**Settlement (seen on settled events):** `GET ...events?status=settled&search=BTC15M` returns `status:"settled"`, `resolvedAt` ≈ expiry + 5–8 s, `settlement.value:"65040.33233333333"`, and per contract `resolutionSide:"yes"|"no"`, `settlementValue`. The source index is Lukka `LS-LRRR-XBTUSD` (`sourceDetails`). Gemini's terms let each contract use a time-weighted average before expiry (60 s is their example); repeating-decimal settlement values fit an average. **We always settle on `resolutionSide`, never on our own price.** Statuses: `approved, active, closed, under_review, settled, invalid`.

**WebSocket** `wss://ws.gemini.com`: `{symbol}@bookTicker` is **public** (fields `u` update id, `E` event time ns, `s` symbol, `b`/`B` best bid price/qty, `a`/`A` best ask price/qty, `c`/`C` last trade price/size). `contractStatus` is public (fields `e, E, s, k` event ticker, `c` contract ticker, `i`, `p` strike (absent for Up/Down until set), `o` old status, `n` new status). Subscribe with `{"id":"1","method":"SUBSCRIBE","params":["GEMI-BTC15M2611162030-UP@bookTicker", "contractStatus"]}`. If a subscription is rejected, fall back to polling the REST events endpoint every 2 s for listed markets (automatic, logged).

### 3.2 Gemini spot (public)
Use `GET https://api.gemini.com/v1/pubticker/btcusd` (or the market-data WS) as a secondary spot check. The primary spot for theo is the Deribit `btc_usd` index (a multi-exchange composite, closer to a reference rate).

### 3.3 Deribit (public, read-only)
`GET https://www.deribit.com/api/v2/public/get_index_price?index_name=btc_usd` answered on 2026-11-16: `{"result":{"index_price":65011.07,...}}`.
- `public/get_instruments?currency=BTC&kind=option&expired=false`: strikes, expiries (08:00 UTC), option type.
- `public/get_book_summary_by_currency?currency=BTC&kind=option`: `mark_iv`, `mark_price` (in BTC), `underlying_price`, `instrument_name` (`BTC-17NOV26-65000-C`).
- WS `wss://www.deribit.com/ws/api/v2`, `public/subscribe` channels `markprice.options.btc_usd` (mark price + IV for every BTC option) and `deribit_price_index.btc_usd`.
- Public requests are rate-limited per IP: use WS subscriptions, refresh instruments every 30 min.

### 3.4 Derive (fallback vol source, public)
`POST https://api.derive.xyz/v3/public/get_tickers` with `{"instrument_type":"option","currency":"BTC","expiry_date":"YYYYMMDD"}` returns per-instrument tickers including bid/ask IV and greeks; use the mark or mid IV per strike. Read `https://docs.derive.xyz/llms.txt` for the full field list when implementing.

### 3.5 QuickNode
- RPC: the Solana devnet endpoint for the app, keeper and scripts.
- Streams: Solana devnet is supported (with program filters). The free trial follows the chain tip only (no backfill), so create the stream before the first devnet trade. Create it **programmatically** with the Streams REST API (`https://api.quicknode.com/`, header `x-api-key`) in `scripts/create-stream.ts`: network Solana devnet, start at the latest block, filter = `streams/filter.js`, destination = webhook `https://<indexer>/streams/webhook?secret=<STREAMS_WEBHOOK_SECRET>`, header `Content-Type: application/json`. Read the REST API's OpenAPI spec from QuickNode's docs for the exact request body.

---

## 4. On-chain program (`programs/wick`, Anchor)

### 4.1 Fixed point
USDC u64 with 6 decimals. Prices are u32 micro-units (1_000_000 = $1.00); tradable range 10_000..=990_000. Leverage u16. Contracts u64 with 6 decimals. Use u128 intermediates and checked math; overflow is an error.

### 4.2 Accounts (PDAs)
`Config` `["config"]`: `admin, keeper, usdc_mint, global_max_leverage (1000), maintenance_bps (0), profit_fee_bps (200), liq_fee_bps (200), max_payout_bps_of_vault (2000), max_market_exposure_bps (5000), liability_allowance (USDC, e.g. 500e6 so the first trades can open), stale_after_secs (5), emission_threshold (USDC), emission_c, staker_cap, paused, bump`.

`Vault` `["vault"]`: USDC token account owned by the vault PDA.

`LpState` `["lp"]`: `balance: i128, high_watermark: u64, cumulative_losses, fees_stakers, fees_treasury, queue_head: u64, queue_tail: u64, queue_owed: u64, reward_per_token_e12: u128, total_staked: u64, loser_mint: Pubkey, bump`.

`Market` `["market", sha256(gemini_symbol)]`: `gemini_symbol [u8;64], kind {UpDown, Ladder}, strike_usd_e6 u64, open_ts, expiry_ts, cutoff_secs (60 for 5/15-min, 300 for hourly, 600 for daily+), mark_yes_e6 u32, mark_ts i64, half_spread_e6 u32, max_leverage u16, status {Open, Halted, Expired, Settled, Invalid}, outcome {None, Yes, No}, oi_yes_e6, oi_no_e6, net_liability_usdc, open_positions u32, bump`.

`Position` `["pos", market, owner, nonce u64]`: `owner, market, side {Yes, No}, margin, leverage, entry_e6, contracts_e6, liq_mark_e6, opened_ts, status {Open, Closed, Liquidated, Settled}, bump`.

`PayoutClaim` `["claim", index u64]`: `owner, amount, paid, created_ts`.

`StakeAccount` `["stake", owner]`: `amount, reward_debt_e12`. Loser token **$WICKED**: SPL mint, 6 decimals, authority = LP PDA.

### 4.3 Instructions

| Instruction | Signer | Effect |
|---|---|---|
| `init_config(params)` | admin | Config, Vault, LpState, loser mint |
| `create_market(symbol, kind, strike, open_ts, expiry_ts, cutoff, half_spread)` | keeper | Market (Open); only after the strike is known |
| `update_marks(Vec<MarkUpdate{market_index, mark_e6, max_leverage}>)` + remaining accounts | keeper | batched; range-checked; sets `mark_ts` |
| `open_position(side, margin, leverage, max_entry_e6, nonce)` | trader | Open; now < expiry − cutoff; mark fresh; leverage ≤ min(global, market); slippage; liability caps (4.5); entry = side mark + half_spread; transfers margin to the vault |
| `close_position(min_exit_e6)` | owner | exit = side mark − half_spread; settle PnL (4.4) |
| `liquidate()` | anyone | if side mark ≤ liq_mark |
| `settle_market(outcome, settlement_value_e6)` | keeper | after expiry; from Gemini's `resolutionSide` only |
| `void_market()` | keeper | Gemini `invalid`: refund margins on `settle_position` |
| `settle_position()` | anyone | after Settled/Invalid |
| `claim_queue()` | anyone | pays the claim at `queue_head` from free vault balance |
| `stake(amount)`, `unstake(amount)`, `claim_rewards()` | user | $WICKED staking |
| `set_params(...)`, `set_paused(bool)`, `set_keeper(pubkey)` | admin | ops |

Emit an Anchor event from **every** instruction (`MarketCreated, MarksUpdated{count, slot}, PositionOpened, PositionClosed, PositionLiquidated, MarketSettled, MarketVoided, PositionSettled, ClaimQueued, ClaimPaid, Staked, Unstaked, RewardsClaimed, LpUpdated{balance, queue_owed}`) with every field the indexer needs.

### 4.4 Position math (identical in `packages/pricing`; property-tested)
```
side_mark = (side == Yes) ? mark_yes : 1e6 - mark_yes
q         = margin * leverage * 1e6 / entry                 (contracts_e6)
pnl(m)    = q * (m - entry) / 1e6                           (signed USDC)
liq_mark  = entry * (1 - (1 - mm) / leverage)               (stored at open)
```
- **Profitable close or settlement:** fee = pnl × profit_fee_bps; owed = margin + pnl − fee. Pay from free vault balance (vault − queue_owed). If short: pay the margin first, enqueue the rest as a `PayoutClaim`.
- **Losing close:** pay margin + pnl (≥ 0); the loss goes to the LP; mint $WICKED on the loss.
- **Liquidation:** the whole margin goes to the LP; liq fee = margin × liq_fee_bps to fees; mint $WICKED on the margin.
- **Settlement:** m = 1e6 (won) or 0 (lost), no spread.
- Fees split 50/50 stakers (accumulator) / treasury. LP gains first repay queued claims (FIFO via `claim_queue`, cranked by the keeper).

### 4.5 Liability caps at open
`max_payout = q * (1e6 - entry) / 1e6`. Require `max_payout ≤ max_payout_bps_of_vault × (vault_free + liability_allowance)` and `market.net_liability + max_payout ≤ max_market_exposure_bps × (vault_free + liability_allowance)`. Errors carry readable messages ("Pool too small for this size — lower leverage or margin").

### 4.6 $WICKED emissions and staking
Below `emission_threshold` of LP balance: 100 tokens per $1 of loss. Above: `100 × (C / (C + H))²`, H = high watermark, C = `emission_c`. Stakers earn the fee share plus LP surplus above `staker_cap`, distributed only when the queue is empty (reward-per-token accumulator).

### 4.7 Program tests (localnet)
Open/close YES and NO, profit and loss; the liquidation boundary (exactly at liq_mark liquidates, one tick above doesn't); stale mark rejects open; cutoff rejects open; leverage above market cap rejects; both liability caps; settlement win/loss; vault short → claim queued → later loss → `claim_queue` pays; void refunds; fee math; emission amounts; staking accrual. Plus a TS property test: 1,000 random positions on-chain vs `packages/pricing`, exact match.

---

## 5. Pricing, vol and risk

### 5.1 Theo (`packages/pricing`, pure)
```
T in years (365-day); d2 = (ln(S/K) − σ²T/2) / (σ√T); N = standard normal CDF
Up/Down (5/15-min):  p_yes = N(d2), K = captured strike, σ = ATM vol (interpolated to the contract expiry)
  TWAP adjustment (flag, default ON): effective variance = σ²·max(T − 60s, 0) + σ²·min(T, 60s)/3
Ladders (hourly/daily/weekly/month-end, "above"):
  p_yes = (C(K − h) − C(K + h)) / (2h), Black-76 calls with σ(K ∓ h) from the smile, h = 0.25% of K
  (the call spread captures skew; no separate correction term)
Time interpolation: total variance w = σ²T linear in T between the two Deribit expiries bracketing the
  Gemini expiry (Gemini ladders expire 22:00 UTC; Deribit at 08:00 UTC). Before the first Deribit expiry,
  use the front expiry's σ (flat in vol).
Smile per expiry: cubic spline of mark IV in log-moneyness ln(K/F), flat extrapolation beyond the last strike.
Clamp p to [0.01, 0.99].
```
**Test vectors** (σ = 0.5 flat, rates 0, TWAP flag OFF, tolerance 1e-4):

| S | K | time to expiry | p_yes |
|---|---|---|---|
| 100000 | 100000 | 10 min | 0.499565 |
| 100100 | 100000 | 10 min | 0.676236 |
| 99000 | 100000 | 12 h | 0.290357 |
| 105000 | 100000 | 7 days | 0.748573 |

With a flat smile, the call-spread ladder price must equal N(d2) within 1e-3.

### 5.2 Risk engine
```
g      = φ(d2) / (σ√T)                       mark sensitivity per unit log-return
σ_m    = g · σ · √Δt                          Δt = 5 s in years
L_cap  = clamp(floor(p_side·(1 − mm) / (k·σ_m)), 1, global_max)     k = 3
```
Unit-test (σ = 0.5, ATM, p = 0.5): 15-min with 10 min left → 4; daily with 12 h left → 38; 30 days → 300 (k = 1 → 902). `liqDistance(position, S)`: solve numerically for the spot at which side mark = liq_mark; return USD and % from spot.

### 5.3 VolSource (`packages/vol`)
```ts
interface VolSource { name: 'deribit'|'derive'|'realized'; spot(): {px:number, ts:number};
  vol(expiryMs: number, strike: number): number; healthy(): boolean; }
```
- `DeribitVolSource` (default): WS index + `markprice.options.btc_usd`, instruments via REST.
- `DeriveVolSource`: `public/get_tickers` per expiry every 5 s.
- `RealizedVolSource`: EWMA (λ = 0.94 per minute) of 1-second log returns from the spot feed, annualized; flat smile.
- The live pricer uses Deribit exclusively for BTC spot and option IV. Pause new marks if the feed is unhealthy and resume when Deribit recovers. The standalone volatility tools also support other providers.

---

## 6. Pricer (`services/backend/src/pricer`, same process as the indexer)

- **Discovery (every 10 s):** list active BTC events; select the current and next **15-min Up/Down**, the current and next **5-min** (secondary), all unexpired **hourly**, **daily**, **weekly** and **month-end** ladders and every active above strike. Skip touch/High-Low contracts and any non-BTC asset (ETH/SOL behind `ENABLE_ALTS`).
- **Strike watch:** for Up/Down, wait until `strike.value` is non-null (at `startTime`), then `create_market` with `open_ts = startTime`, `expiry_ts = expiryDate`.
- **Quotes:** public `bookTicker` per listed symbol; REST polling fallback.
- **Marks (adaptive, to save devnet SOL and RPC credits):** compute theo + cap every 1 s, but send a batched `update_marks` tx only when any listed market's theo moved ≥ 0.1¢ since its last posted mark, its cap changed, or 4 s passed (heartbeat). Set `stale_after_secs = 6`. Priority fee 0 on devnet unless a tx fails to land for 3 s, then add a small one. If the vol source is unhealthy, skip (the on-chain staleness check halts trading).
- **Liquidator (every 1 s, after marks):** scan open positions (the in-process SQLite `positions` table, falling back to `getProgramAccounts` + memcmp) and liquidate any at or below liq_mark.
- **Settler:** after expiry, poll the event every 3 s until `settled` (→ `settle_market(resolutionSide, settlementValue)`) or `invalid` (→ `void_market`); then crank `settle_position` for every open position and `claim_queue` while the vault has free balance.
- **API (the shared Fastify server):** `GET /markets` → `[{symbol, eventTicker, kind, duration, title, strike, openTs, expiryTs, spot, theo, gemini:{bid,ask,mid,last,ts}, edge, maxLeverage, status, volSource}]`; `GET /markets/:symbol/history` (last 30 min: ts, theo, gemini mid, spot); `WS /stream` (snapshot every 1 s); `GET /health`.

---

## 7. Indexer (`services/backend/src/indexer`) + Streams

- `POST /streams/webhook?secret=...`: check the secret; respond 200 immediately (Streams waits for delivery before the next batch), then process.
- `streams/filter.js` (Solana payload: `stream.data[0]` is the block; transactions at `block.transactions`; `tx.transaction.signatures[0]`, `tx.transaction.message.instructions[].programId`, `tx.meta.err`, `tx.meta.logMessages`, `block.blockTime`, `block.parentSlot`):
```js
const PROGRAM_ID = "__PROGRAM_ID__";
function main(stream) {
  const block = stream.data && stream.data[0];
  if (!block || !block.transactions) return null;
  const matched = [];
  for (const tx of block.transactions) {
    if (tx.meta && tx.meta.err) continue;
    const ixs = (tx.transaction && tx.transaction.message && tx.transaction.message.instructions) || [];
    const inner = ((tx.meta && tx.meta.innerInstructions) || []).flatMap(g => g.instructions || []);
    if (![...ixs, ...inner].some(ix => ix.programId === PROGRAM_ID)) continue;
    matched.push({ signature: tx.transaction.signatures[0], slot: block.parentSlot + 1,
                   blockTime: block.blockTime, logs: (tx.meta && tx.meta.logMessages) || [] });
  }
  return matched.length ? { matchedTransactions: matched } : null;
}
```
`scripts/create-stream.ts` substitutes the program ID, then tests the filter against a recent devnet block containing one of our transactions via the Streams test endpoint; save the sample payload to `services/backend/fixtures/`. If the real payload's field paths differ, fix the filter and the fixture together.
- Decode Anchor events from `Program data:` log lines with the IDL event coder; upsert idempotently on `(signature, event_index)`.
- Storage: SQLite via `better-sqlite3` at `SQLITE_PATH` (a Railway volume, so data survives redeploys), WAL mode, one writer (this process). Schema: `events(signature, event_index, slot, block_time, name, data TEXT /*json*/, UNIQUE(signature,event_index))`, `positions(...)`, `markets(...)`, `lp_snapshots(block_time, balance, queue_owed, fees)`. Migrations run at boot. The chain is the source of truth: if the file is ever lost, rebuild positions and markets from `getProgramAccounts` at boot.
- Read API on the same server: `GET /feed?limit=50`, `GET /leaderboard`, `GET /lp/history`, `GET /positions?owner=`, `GET /events/stream` (SSE for the live feed).
- Reconciliation: a labelled gap-filler job using `getSignaturesForAddress` every 60 s, never the primary path.

---

## 8. Frontend (`app/`)

Dark trading UI. All prices in cents ("62.4¢"); BTC prices in dollars.
1. **`/` Markets:** hero card for the live **BTC 15-min Up/Down** (countdown, strike, spot, theo, Gemini bid/ask, edge, max leverage). Below it, the **Tail ladder:** tabs Hourly / Daily / Weekly / Month-end; rows = strike, % from spot, theo YES, Gemini bid/ask (or "no bid"/"no ask"), edge, max leverage, Trade button. A vol-source badge.
2. **`/m/[symbol]` Trade:** theo vs Gemini mid chart (30 min); YES/NO; margin; leverage slider capped at the live market cap, with a tooltip "Risk cap 4x (global 1000x): above this, an ordinary few-second BTC move could liquidate you" (the cap value comes from the API); preview: entry, contracts, max payout, liquidation price in BTC USD and % from spot, fee; Open / Close; readable errors.
3. **`/portfolio`:** open/closed positions, live PnL, close, settled results, queued claims with "claim" button.
4. **`/pool`:** LP balance over time, queue owed, fees, emissions, stake/unstake/claim.
5. **Activity feed** (right rail, every page): live from the backend's SSE (`/events/stream`); label "Live via QuickNode Streams".
6. **"Try it now" demo wallet (primary path for judges):** one click creates a throwaway keypair in the browser (localStorage), and a Vercel API route funds it from the treasury wallet with 0.05 devnet SOL + 1,000 test USDC (one per browser per 10 min, capped at 200 wallets total). Show a banner: "Demo wallet, devnet only" with an export/reset button. Phantom/Solflare via wallet adapter stay available for anyone who prefers them, with the same faucet button.
7. Footer: "Devnet demo. Test USDC only. Not a real-money product."

Marketing copy: "Wick. Every Gemini strike, at fair value. Risk-capped leverage up to 300x."

---

## 9. Scripts
`create-mint.ts`, `deploy.ts`, `init-config.ts`, `airdrop.ts`, `sol-collector.ts` (10.2), `create-stream.ts`, `bots.ts` (N wallets, random sides/sizes/leverage within caps, for M minutes; prints a summary; used to seed the vault before the demo and to stress liquidations and the queue), `demo-check.ts` (asserts: marks fresh < 6 s, a 15-min market live, indexer received an event in the last 60 s, vault balance > 0), `record-demo.ts` (section 11).

---

## 10. Deployment
- Program: `anchor deploy --provider.cluster devnet`; program ID in README and `.env`.
- Backend: one Railway service from `services/backend/Dockerfile`, deployed with `railway up` using `RAILWAY_TOKEN`. Attach a 1 GB volume at `/data`, set env vars with `railway variables`, generate a public domain (`railway domain`) and use it for `NEXT_PUBLIC_BACKEND_URL` and the Streams webhook URL. Health check `/health`; restart policy always. Region: Railway's default US region; if the Deribit probe fails there, the auto-fallback covers it (no proxies). Graceful shutdown on SIGTERM: stop loops, flush SQLite, then exit, so redeploys don't corrupt the file.
- Cost guard: log CPU and RAM every 5 min; target < 0.2 vCPU average and < 512 MB. Record Railway's usage figure in `docs/HANDOFF.md` after deploy.
- Frontend: Vercel Hobby via `VERCEL_TOKEN` (`vercel deploy --prod`); set public env vars. The faucet runs as a Vercel API route.
- Structured logs (pino); timeouts + retries with backoff on every external call; no secrets in git.

### 10.1 QuickNode credit budget (free trial: 10M credits, no overage, 15 req/s)
When credits run out, the stream and every QuickNode RPC call stop, so protect them:
- **Streams bill per block processed, not per match** (filters don't reduce credits), and Solana produces a block about every 400 ms. Create the stream only once the core build works (target Wed Nov 18), not on day 1.
- **Route regular RPC away from QuickNode.** Keeper, liquidator, settler, scripts and bots use the public devnet RPC (`https://api.devnet.solana.com`, rate-limited per IP) as primary, with QuickNode as automatic failover. The frontend uses the public devnet RPC for reads and wallet sends. A standard Solana call costs about 30 credits, so 1 keeper tx/s alone would burn about 2.6M credits a day on QuickNode.
- **Measure, then adapt.** One hour after creating the stream, read usage from the QuickNode dashboard API and project the burn through Sat Nov 21, 23:59 CST. If it would exceed 8M credits, switch the stream to on-demand: pause it via the Streams REST API whenever the app has had no visitors for 10 min, resume on the next visit, and let the labelled `getSignaturesForAddress` gap-filler backfill the paused window. Log the projection and the decision in `docs/HANDOFF.md`.

### 10.2 Devnet SOL budget (~10–15 SOL through Sat Nov 21)
Rough needs: program deploy 3–6 SOL (rent scales with program size; an upgrade briefly needs a second buffer), keeper about 0.2–0.4 SOL a day with adaptive marks, demo wallets 0.05 SOL each, bots a few SOL. The official faucet allows 2 requests per 8 hours (more with GitHub sign-in), and CLI airdrops are capped at 2 SOL per request.
- `scripts/sol-collector.ts`: starts in WP0 and runs on the backend from then on. It requests airdrops to a treasury wallet at each faucet's allowed rate (RPC `requestAirdrop` on public devnet and the QuickNode endpoint; retries with backoff; never faster than the published limits), and tops up the keeper (keep ≥ 1 SOL) and the demo-wallet funder from the treasury.
- Keep the program small (no unused dependencies; `opt-level = "z"` if size is an issue) and deploy with `--max-len` sized to the build plus 20%, not 2x.
- Close position and claim accounts after settlement to reclaim rent to the treasury.
- `demo-check.ts` fails if the keeper has < 0.5 SOL or the treasury < 2 SOL.
- If the treasury can't reach 8 SOL by Wed Nov 18 noon CST, write that in `docs/HANDOFF.md` as the single action for the account holders: sign in to faucet.solana.com with GitHub and send SOL to the treasury address.

---

## 11. Submission assets (agent-produced)
- **README.md:** problem; what it does; architecture diagram (Mermaid: Gemini + Deribit → pricer → program ← app; program → QuickNode Streams → indexer → app); how pricing works (formulas from 5.1); the leverage-cap table from 5.2; **economic design and risk assumptions** (LP model, fees, emissions, caps, queue, trusted keeper, oracle and staleness, devnet only); **how Solana is used** + program ID + explorer links; **QuickNode Streams: network (Solana devnet), dataset (blocks), filter logic (program-ID match, failed txs skipped, logs kept), destination (webhook → SQLite in the backend), and why** (low-latency push of exactly our program's events with no polling; powers the feed, leaderboard and LP chart); Gemini API endpoints used and where; setup instructions; known limitations.
- **Positioning rule for all copy:** never claim to be the first leveraged prediction market (D8X, Crypto.com's OG and XBIT already offer leverage or margin on event contracts). What's unique, and what the "what makes it unique" answer must say: (1) every Gemini strike, tails included, quoted at an options-implied fair price instead of a thin order book; (2) a pool that bootstraps itself from losses, so no outside LP capital is needed; (3) a risk engine that sets leverage per market from binary gamma, so leverage is high where it's safe and low where it isn't.
- **docs/DEVPOST.md:** project name (Wick), short description, the five written answers, technologies and sponsor tools, form selections (Track 02; chain award Solana; bounties Gemini Prediction Markets + QuickNode Streams).
- **Demo video** (`scripts/record-demo.ts`): run `bots.ts` to seed, then drive the deployed app with Playwright (video recording on) through: tail ladder → "Try it now" demo wallet → open YES at the cap on the live 15-min market → a 1000x attempt clamped → a liquidation appearing in the feed → the window settling from Gemini's outcome → the pool page. Cut to 2:30–3:00 with ffmpeg and burn in captions from `docs/DEMO.md`. Output `demo/wick-demo.mp4`.
- **docs/HANDOFF.md:** deployed URLs, program ID, what the account holders must do (upload `demo/wick-demo.mp4`; paste `docs/DEVPOST.md`; submit before Fri Nov 20 12:00 PM CST), anything missing.

---

## 12. Work plan (orchestrator + subagents)

The orchestrator does WP0, spawns subagents, merges, and runs WP11. Each subagent gets: this spec, its WP, the shared types in `packages/shared`, and its done-criteria. Each works on its own branch with tests; the orchestrator merges after CI passes.

| WP | Package | Parallel group | Depends on | Done when |
|---|---|---|---|---|
| 0 | Setup: monorepo, pinned toolchain, CI, keypairs, test-USDC mint, `packages/shared` types incl. the pricer API contract and IDL placeholder; start `sol-collector.ts` immediately (10.2) | A (orchestrator) | — | CI green; collector running |
| 1 | `packages/pricing` (5.1, 5.2, 4.4 math) | B | 0 | test vectors + cap tests pass |
| 2 | Anchor program + tests (4) | B | 0 | 4.7 passes; devnet deployed; IDL exported to shared |
| 3 | `packages/gemini` (3.1–3.2): parsers, discovery, WS + fallback, settled reader, fixtures saved from live calls | B | 0 | parses live data; streams quotes |
| 4 | `packages/vol` (3.3–3.4, 5.3) with auto-fallback | B | 0 | live surface; fallback test passes (simulate Deribit failure) |
| 5 | Pricer module of `services/backend` (6) + the shared Fastify server | C | 1–4 | marks live on devnet; a real 15-min market settles unattended |
| 6 | Indexer module of `services/backend` + SQLite + `streams/` + `create-stream.ts` (7) | C | 2 | feed shows a devnet trade ≤ ~2 s |
| 7 | `app/` (8) | C | 2 (IDL), API contract from 0 | full trade flow in a fresh browser via the one-click demo wallet, against devnet |
| 8 | Scripts (9) | C | 2, 5 | bots run 30 min error-free; vault > 0 |
| 9 | Deploy (10) | D | 5–7 | public URLs work in a clean browser |
| 10 | Submission assets (11) | D | 9 | every item in section 0's guide list exists |
| 11 | Independent E2E check: a fresh subagent that has not seen the code runs `demo-check`, then the full lifecycle on the deployed app via Playwright, and files failures as issues; the orchestrator fixes them and re-runs until clean | E | 10 | zero open failures |

---

## 13. Non-goals
No order placement on Gemini. No touch / High-Low contracts. No mainnet. No user-provided LP deposits (the pool grows only from losses, by design). No ElevenLabs or Grok Bot integration.