# Wick — Devpost submission copy

> **Submission operator note — November 20, 2026:** the [frontend](https://wick-markets-phi.vercel.app/), [backend](https://wick-backend-production-1e2c4649.up.railway.app/health) and executable Solana devnet program are public. A finalized Wick market settlement matches Gemini's official outcome and value. The public faucet/open-position browser path is not verified end to end. The feed currently reports `provenance: "rpc_reconcile"`; backend health reports `indexerConfigured: false` and `streamEvidencePresent: false`. Do not select or claim QuickNode Streams.

## Project name

Wick

## Tagline

Every Gemini strike, at fair value. Risk-capped leverage up to 300x.

## Short description

Wick turns Gemini's live BTC prediction markets into risk-capped synthetic YES/NO positions on Solana devnet. It prices every supported strike from the BTC options volatility surface, sets leverage market by market using binary gamma, and uses trader losses to bootstrap its own liquidity pool.

## 1. What did you build?

We built Wick, a devnet trading interface and Anchor program for leveraged synthetic positions on Gemini's BTC prediction markets. Wick discovers Gemini's 5-minute, 15-minute, hourly, daily, weekly, and month-end contracts, calculates an options-implied fair value for each strike, and shows that theo beside Gemini's live bid and ask.

The Solana program implements opening and closing YES/NO positions, liquidation, official-outcome settlement, market/vault exposure limits, FIFO payout claims, a self-bootstrapping pool, $WICKED emissions, and staking. A single Node backend runs market discovery, pricing, keeper/liquidator/settler loops, an optional QuickNode Streams webhook, SQLite projections, RPC reconciliation, and read APIs. The Next.js interface includes markets, trade previews, portfolio, pool analytics, activity, a clearly separate browser-only practice account, and local/Phantom/Solflare devnet wallet support. Guest transfers are labelled simulated browser-only actions and are not presented as chain or Stream evidence.

Current evidence boundary: program [`GY2WTMTTpSh3xBaf1HYGP5PDic5vjA5wucJdTci92GL8`](https://explorer.solana.com/address/GY2WTMTTpSh3xBaf1HYGP5PDic5vjA5wucJdTci92GL8?cluster=devnet) is executable on devnet. Gemini event `BTC05M2611201520` resolved **No** at `60258.3`; finalized Wick [transaction `2dyg…FvT`](https://explorer.solana.com/tx/2dygCmL5yYEdDuwVrCgreeMrHc3Jzfnz778rbqEGjYejYzpecarKVkWoXsxR1CquSA4omzNZVWWW4GHPVqkxdFvT?cluster=devnet) settled the matching market PDA with outcome `no` and value `60258300000`. This proves Gemini/Solana market settlement, not a public-browser position lifecycle, automated-keeper attribution, or QuickNode delivery.

## 2. What problem does it solve?

Prediction-market liquidity clusters around likely outcomes. Tail strikes can be thin or one-sided, leaving traders without a useful reference price. At the same time, a fixed leverage limit ignores how violently a binary contract's value can move: 100x may be plausible for a distant, long-dated tail but dangerous for an at-the-money contract minutes from expiry.

Wick gives every supported Gemini strike an independent options-implied theo, so price discovery does not disappear when an order book is sparse. It then converts binary mark sensitivity into a live leverage cap, reducing leverage exactly where a small BTC move can cause a large probability move. The pool design addresses cold-start liquidity by retaining trading losses instead of requiring an outside LP deposit.

## 3. How does it work?

Gemini's public prediction-market API supplies contract definitions, captured strikes, live quotes, lifecycle status, and the official `resolutionSide`. Deribit's BTC index and options surface supply spot and implied volatility. If that live source is unhealthy, Wick stops posting marks so on-chain staleness halts new trades.

For Up/Down markets, Wick prices `N(d2)` at Gemini's captured strike with a one-minute settlement-window variance adjustment. For “BTC above K” ladders, it uses a smile-aware symmetric Black-76 call spread. Total variance is interpolated across expiries, and a cubic smile interpolates strike volatility. A binary-gamma formula estimates the contract's five-second mark volatility and sets the maximum leverage.

The keeper posts batched marks to the Anchor program. The connected-wallet path builds real devnet transactions; the program verifies staleness, cutoff, slippage, leverage and liability limits. Gemini's outcome is the only settlement authority. Losses increase the pool and mint $WICKED; profitable payouts use free vault liquidity or enter a FIFO claim queue. A fresh public-browser faucet/open-position flow remains unverified.

The implemented optional Stream path is Solana devnet blocks → a QuickNode program filter → an authenticated webhook → idempotent Anchor event decoding → SQLite WAL. It is not active. Today the deployed feed and projections are populated by labelled 60-second RPC reconciliation, and returned feed events carry `provenance: "rpc_reconcile"`.

## 4. What makes it unique?

Wick does not claim to be the first leveraged prediction market. Its distinct combination is:

1. **Every Gemini strike, tails included, gets an options-implied fair price** instead of relying only on a thin order book.
2. **The pool bootstraps itself from trader losses**, so it needs no outside LP capital to begin growing.
3. **Leverage is set per market from binary gamma**, so it can be high where the risk permits and low where an ordinary BTC move could liquidate a position.

That connects two markets that usually live apart: the continuous information in BTC options and the simple outcome contracts traders understand. It also makes risk visible in the product—the cap is part of every quote and preview, not a hidden back-office setting.

## 5. What would you build next?

First, we would replace the trusted keeper with a decentralized or multi-party oracle/keeper design, commission an independent program audit, add invariant/fuzz testing, and validate the pool under adversarial volatility and provider outages. We would study solvency and queue behavior with longer simulations before considering anything beyond devnet.

On the product side, we would add richer portfolio risk, historical model calibration against Gemini settlements, transparent keeper/oracle attestations, more assets behind explicit risk approval, and governance over caps and emissions. We would also measure actual QuickNode credit use and activate the designed pause/resume policy if projected usage exceeds the budget.

## Technologies used

- Solana devnet, Anchor 0.31.1, Rust 1.85.1, SPL Token
- TypeScript 5.8, Node.js 22+, pnpm workspaces
- Next.js 15.5.29, React 18, Tailwind CSS, Solana wallet adapters
- Fastify, WebSocket, SSE, Pino, Zod
- SQLite via `better-sqlite3` in WAL mode
- Gemini Prediction Markets public REST and WebSocket APIs
- Deribit public REST/WebSocket
- QuickNode Streams REST/filter/webhook implementation; live Stream evidence pending
- Railway backend and Vercel frontend deployed; Solana devnet program verified; public browser trade acceptance unverified
- Vitest, Cargo tests, Playwright, ffmpeg

## Sponsor-tool details

### Gemini Prediction Markets

**Evidence present; select the Gemini Prediction Markets bounty.** Wick uses Gemini's public active/settled event endpoints, per-event and strike endpoints, `bookTicker`, and `contractStatus`. Real responses are captured in repository fixtures, live discovery/quote checks passed, and official `resolutionSide` is the only settlement authority. Wick does not place orders on Gemini.

### QuickNode Streams

**Do not select this bounty.** The repository contains the Solana block filter, authenticated destination, IDL event decoder, idempotent SQLite indexer, REST creation/test script, and feed consumers, but the deployed backend reports `indexerConfigured: false` and `streamEvidencePresent: false`. Current feed entries are labelled `rpc_reconcile`; no active Stream or authenticated delivery is evidenced.

## Form selections and evidence gate

| Devpost field | Selection | Evidence condition |
|---|---|---|
| Track | **Track 02 — DeFi & Onchain Apps** | Select with the deployed-program and official-settlement evidence above; do not claim the unverified browser trade path. |
| Chain award | **Best use of Solana** | Select. The custom Anchor program is executable on devnet and a finalized official-outcome settlement is linked above. |
| Bounty | **Gemini Prediction Markets** | Select: implemented with real public API evidence and documented endpoints. Overall submission still needs the working-demo gate. |
| Bounty | **QuickNode Streams** | **DO NOT SELECT YET.** Select only after active Stream/filter/destination and real delivery evidence are recorded. |

## Links to enter only after verification

- Public source repository: [github.com/alycz/wick](https://github.com/alycz/wick)
- Deployed frontend: [wick-markets-phi.vercel.app](https://wick-markets-phi.vercel.app/). URL availability is verified; a fresh public-browser transaction flow is not.
- Backend health/API: [wick-backend-production-1e2c4649.up.railway.app/health](https://wick-backend-production-1e2c4649.up.railway.app/health)
- Solana program: [`GY2WTMTTpSh3xBaf1HYGP5PDic5vjA5wucJdTci92GL8`](https://explorer.solana.com/address/GY2WTMTTpSh3xBaf1HYGP5PDic5vjA5wucJdTci92GL8?cluster=devnet)
- Verified Gemini settlement: [`2dyg…FvT`](https://explorer.solana.com/tx/2dygCmL5yYEdDuwVrCgreeMrHc3Jzfnz778rbqEGjYejYzpecarKVkWoXsxR1CquSA4omzNZVWWW4GHPVqkxdFvT?cluster=devnet)
- Demo video: pending accessible 2–3 minute upload
- QuickNode Stream evidence: pending and required only if selecting that bounty

## Safety and limitations

Wick is an unaudited Solana devnet demo using self-minted test USDC. No real funds and no mainnet are supported. The pool can queue profitable payouts; leverage and liability caps reduce risk but do not guarantee solvency. The keeper and external market-data providers are trusted components. Guest examples and transfer receipts are simulated locally. The connected-wallet path fails closed unless configuration, account state and transaction confirmation are valid; its fresh public-browser path remains unverified.

## Submission timing and attendance

- Internal complete, deploy and verify cutoff: **Thursday, November 19, 2026 at 11:59 PM CST**.
- Official Devpost close: **Friday, November 20, 2026 at 12:00 PM CST**.
- Finalists must be present **in person in Austin on Saturday, November 21** to qualify for prizes under the official rules. Confirm team attendance before submitting.
