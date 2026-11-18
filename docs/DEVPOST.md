# Wick — Devpost submission copy

> **Submission operator note — November 18, 2026:** the frontend is publicly reachable at [wick-markets-phi.vercel.app](https://wick-markets-phi.vercel.app/) (HTTP 200 verified). The prose below describes the implemented project, not a verified end-to-end trading deployment. Do not submit it as a working demo until `pnpm deploy:verify` passes, the final URLs and video are accessible, and the evidence selections below are satisfied. As of November 17, QuickNode must **not** be selected.

## Project name

Wick

## Tagline

Every Gemini strike, at fair value. Risk-capped leverage up to 300x.

## Short description

Wick turns Gemini's live BTC prediction markets into risk-capped synthetic YES/NO positions on Solana devnet. It prices every supported strike from the BTC options volatility surface, sets leverage market by market using binary gamma, and uses trader losses to bootstrap its own liquidity pool.

## 1. What did you build?

We built Wick, a devnet trading interface and Anchor program for leveraged synthetic positions on Gemini's BTC prediction markets. Wick discovers Gemini's 5-minute, 15-minute, hourly, daily, weekly, and month-end contracts, calculates an options-implied fair value for each strike, and shows that theo beside Gemini's live bid and ask.

The Solana program implements opening and closing YES/NO positions, liquidation, official-outcome settlement, market/vault exposure limits, FIFO payout claims, a self-bootstrapping pool, $WICKED emissions, and staking. A single Node backend runs market discovery, pricing, keeper/liquidator/settler loops, the QuickNode Streams webhook, SQLite projections, and read APIs. The Next.js interface includes markets, trade previews, portfolio, pool analytics, live activity, browser-local demo wallets, and Phantom/Solflare support.

Current evidence boundary: the public source and deployed frontend are available. Main CI [44236165665](https://github.com/alycz/wick/actions/runs/44236165665) passed on `f189083807f913c31faf5ca2571447ab99a00d1f` at 04:26:30 UTC on November 18, including TypeScript and Anchor local-validator checks. This does not verify a public devnet trading lifecycle. Program/mint, backend, actual Stream delivery, working faucet/trades and final video still require deployment and acceptance evidence. We will not present a build-time program ID or a reachable frontend as end-to-end completion.

## 2. What problem does it solve?

Prediction-market liquidity clusters around likely outcomes. Tail strikes can be thin or one-sided, leaving traders without a useful reference price. At the same time, a fixed leverage limit ignores how violently a binary contract's value can move: 100x may be plausible for a distant, long-dated tail but dangerous for an at-the-money contract minutes from expiry.

Wick gives every supported Gemini strike an independent options-implied theo, so price discovery does not disappear when an order book is sparse. It then converts binary mark sensitivity into a live leverage cap, reducing leverage exactly where a small BTC move can cause a large probability move. The pool design addresses cold-start liquidity by retaining trading losses instead of requiring an outside LP deposit.

## 3. How does it work?

Gemini's public prediction-market API supplies contract definitions, captured strikes, live quotes, lifecycle status, and the official `resolutionSide`. Deribit's BTC index and options surface supply spot and implied volatility; Wick falls back to Derive and then EWMA realized volatility if the primary surface is unhealthy.

For Up/Down markets, Wick prices `N(d2)` at Gemini's captured strike with a one-minute settlement-window variance adjustment. For “BTC above K” ladders, it uses a smile-aware symmetric Black-76 call spread. Total variance is interpolated across expiries, and a cubic smile interpolates strike volatility. A binary-gamma formula estimates the contract's five-second mark volatility and sets the maximum leverage.

The keeper posts batched fresh marks to the Anchor program. Traders sign real devnet transactions; the program verifies staleness, cutoff, slippage, leverage and liability limits. Gemini's outcome is the only settlement authority. Losses increase the pool and mint $WICKED; profitable payouts use free vault liquidity or enter a FIFO claim queue.

The intended live event path is Solana devnet blocks → a QuickNode program filter → an authenticated webhook → idempotent Anchor event decoding → SQLite WAL → REST/SSE activity, positions, leaderboard and pool history. A 60-second RPC job is reconciliation, not the primary path. This path is implemented but remains a conditional claim until a real Stream and transaction are verified.

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
- Next.js 14, React 18, Tailwind CSS, Solana wallet adapters
- Fastify, WebSocket, SSE, Pino, Zod
- SQLite via `better-sqlite3` in WAL mode
- Gemini Prediction Markets public REST and WebSocket APIs
- Deribit public REST/WebSocket, Derive v3, EWMA realized-vol fallback
- QuickNode Streams REST/filter/webhook implementation; live Stream evidence pending
- Railway backend and Vercel deployment definitions; frontend deployed, integrated backend/on-chain acceptance unverified
- Vitest, Cargo tests, Playwright, ffmpeg

## Sponsor-tool details

### Gemini Prediction Markets

**Evidence present; select the Gemini Prediction Markets bounty.** Wick uses Gemini's public active/settled event endpoints, per-event and strike endpoints, `bookTicker`, and `contractStatus`. Real responses are captured in repository fixtures, live discovery/quote checks passed, and official `resolutionSide` is the only settlement authority. Wick does not place orders on Gemini.

### QuickNode Streams

**Conditional; do not select this bounty yet.** The repository contains the Solana block filter, authenticated destination, IDL event decoder, idempotent SQLite indexer, REST creation/test script, and feed consumers. Eligibility requires a real active Stream ID, verified test-filter result for a deployed Wick transaction, public destination, and observed low-latency `/feed` delivery. None exists as of November 17. Select QuickNode only after every box in `docs/ELIGIBILITY.md` is checked and record the evidence here before submission.

## Form selections and evidence gate

| Devpost field | Selection | Evidence condition |
|---|---|---|
| Track | **Track 02 — DeFi & Onchain Apps** | Intended selection. Submit only after the public demo interacts with the deployed Wick smart contract and the economic/risk documentation remains in README. |
| Chain award | **Best use of Solana** | Intended selection after the Wick Anchor program is executable on devnet, its actual ID/explorer link is in README, and the lifecycle is verified. |
| Bounty | **Gemini Prediction Markets** | Select: implemented with real public API evidence and documented endpoints. Overall submission still needs the working-demo gate. |
| Bounty | **QuickNode Streams** | **DO NOT SELECT YET.** Select only after active Stream/filter/destination and real delivery evidence are recorded. |

## Links to enter only after verification

- Public source repository: [github.com/alycz/wick](https://github.com/alycz/wick); tested frontend baseline `f189083807f913c31faf5ca2571447ab99a00d1f`
- Deployed frontend: [wick-markets-phi.vercel.app](https://wick-markets-phi.vercel.app/). URL availability is verified, but this is not yet a verified working trading demo.
- Backend health/API: pending Railway HTTPS URL
- Solana program: pending actual devnet program ID and explorer link
- Demo video: pending accessible 2–3 minute upload
- QuickNode Stream evidence: pending and required only if selecting that bounty

## Safety and limitations

Wick is an unaudited Solana devnet demo using self-minted test USDC. No real funds and no mainnet are supported. The pool can queue profitable payouts; leverage and liability caps reduce risk but do not guarantee solvency. The keeper and external market-data providers are trusted components. Current source has real transaction adapters that fail closed until a real program, matching generated IDL and funded authorities are configured. See `docs/WP11_REPORT.md` for open limits.

## Submission timing and attendance

- Internal complete, deploy and verify cutoff: **Thursday, November 19, 2026 at 11:59 PM CST**.
- Official Devpost close: **Friday, November 20, 2026 at 12:00 PM CST**.
- Finalists must be present **in person in Austin on Saturday, November 21** to qualify for prizes under the official rules. Confirm team attendance before submitting.
