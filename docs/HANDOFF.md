# Wick handoff

Last updated: 2026-11-16 (UTC)

## Progress

- WP0: code complete and locally verified — monorepo, pinned toolchain, CI, shared API contracts and conservative devnet SOL collector created. Shared tests and strict TypeScript checks pass. Collector is running, but funding/mint creation is blocked as described below.
- WP1: complete on branch `wp1/pricing` — pure TypeScript theo, smile/total-variance interpolation, binary-gamma leverage cap, liquidation distance, and exact fixed-point position/liability math. All four build-spec theo vectors, leverage-cap vectors, and a 1,000-position integer property test pass (17 WP1 tests).
- WP2: implemented on `wp2/anchor` — Anchor accounts, instructions, checked fixed-point math, events, payout queue, emissions and staking. Native Rust compile/tests pass. Full Anchor local-validator tests, generated IDL and devnet deployment remain blocked pending the pinned Solana/Anchor CLI toolchain and funded devnet deploy authority.
- WP3: complete on branch `wp3/gemini` — strict Gemini REST/WS schemas, BTC market classification/discovery, quotes, strike and settlement readers, resilient REST retries, WebSocket subscription with automatic 2-second REST fallback, real API fixtures and live verification. Package TypeScript validation and 9 unit/integration-fixture tests pass; live REST/WS check emitted a real BTC15M quote.
- WP4: complete on branch `wp4/vol` — `packages/vol` implements Deribit REST/WebSocket, Derive v3 REST polling, EWMA realized-vol fallback, cubic-smile and total-variance interpolation, strict five-second health checks, retry/timeouts, and priority auto-fallback with logged switches. Seven deterministic tests pass, including simulated Deribit startup failure → Derive selection. Repository-wide strict TypeScript validation passes. Live checks verified healthy Deribit and Derive surfaces; details are in `docs/FINDINGS.md`.
- WP5: implementation complete on `wp5/backend-pricer` — real Gemini discovery/strike watch/WS+REST quote integration, Deribit→Derive→realized vol integration, theo/cap calculation, adaptive mark batching, keeper/liquidator/settler ports, 30-minute history, `/markets`, `/markets/:symbol/history`, WebSocket `/stream`, `/health`, structured redacted logs, background provider warmup, graceful shutdown and resource telemetry. Six backend tests pass and the production TypeScript build is clean. Live read-only verification selected 44 real Gemini contracts with a healthy Deribit surface. The WP5 devnet completion criterion (live on-chain marks and an unattended real settlement) remains blocked because WP2 has no deployed program/IDL, the treasury has no SOL, and required credentials are absent; `/health` exposes `chainConfigured: false` and the process never fakes chain success.
- WP6: implementation complete on `wp6/indexer` — one-process Fastify integration; SQLite migrations/WAL; idempotent Anchor-event ingestion; positions, markets, claims and LP projections; `/feed`, `/leaderboard`, `/lp/history`, `/positions`, `/claims` and SSE `/events/stream`; boot-time account rebuild; labelled 60-second Solana gap filler; program-ID Streams filter; and a guarded QuickNode REST creation script. Three WP6 tests cover webhook authentication/validation, immediate acknowledgement, binary event decoding, projections, redelivery idempotency, and top-level/inner instruction filtering. Backend tests and repository-wide strict TypeScript checks pass. A live Stream was deliberately not created: the Wick program is not deployed, there is no real program transaction/block with which to verify the filter, and the QuickNode key/backend URL/webhook secret are unavailable. Consequently WP6's live ≤2-second devnet trade criterion remains blocked; no synthetic payload or deployment is claimed.
- WP7: implementation complete on `wp7/frontend` — Next.js 14 App Router frontend with responsive dark trading UI for `/`, `/m/[symbol]`, `/portfolio`, and `/pool`; validated live `/markets`, history, `/health`, WebSocket and SSE clients; QuickNode activity rail; browser-local demo keypair with export/reset; Phantom/Solflare support; fixed-point trade previews; and fail-closed, readable chain configuration errors. The Vercel faucet route submits one real devnet transaction for 0.05 SOL and 1,000 six-decimal test USDC only when the treasury, mint and mint authority are configured and verified; it enforces a 10-minute browser/IP cooldown plus local and on-chain 200-grant caps and never returns a fabricated balance. Three unit/component tests, ESLint, strict TypeScript and the optimized production build pass. Managed browser QA verified all four routes, exact safety copy, honest unconfigured/empty states, localStorage wallet persistence, safe faucet failure when unconfigured and readable chain-action errors. Full fresh-browser trade/faucet verification remains blocked by the missing deployed program/IDL, funded treasury, test-USDC mint, backend deployment and Vercel configuration; no deployment is claimed.
- WP8–WP11: not yet started.

## Credentials and deployment blockers

The current environment does not expose `GITHUB_TOKEN`, `QUICKNODE_API_KEY`, `QUICKNODE_RPC_URL`, `RAILWAY_TOKEN`, or `VERCEL_TOKEN`. Public repository cloning works, but authenticated pushes and sponsor deployment/configuration cannot proceed until the applicable credentials are available. No credential values have been printed or stored in the repository.

The environment also lacks local Rust, Solana, Anchor and SPL Token CLIs. CI pins Rust 1.85.1, Solana 2.2.20 and Anchor 0.31.1; local installation is still required for program build/deploy work.

The public Solana devnet RPC returned HTTP 410 with "The RPC faucet is closed on this cluster" on the first collector attempt. No QuickNode RPC URL is present, so the collector has no second faucet. Current public addresses and confirmed balances:

- Treasury: `B4nEhYCDBaX7pejdVrXxaF1U2QftfLjK6vEk7NL64W95` — 0 SOL
- Keeper: `HNERJLwksoZtDeuAikaxHk4ipJUWj7d38GWYsoD93Ymo` — 0 SOL
- Demo-wallet funder: `4hViJTPMJ3jMqAbnLaHFg2iEqQsMhkhXtLMCs6J27zPD` — 0 SOL

Required account-holder action if automated funding remains unavailable by Wednesday November 18 noon CST: sign in to `faucet.solana.com` with GitHub and send at least 8 devnet SOL to the treasury address above. The test-USDC mint cannot be created until the treasury has SOL for rent and fees.

Collector persistence: `scripts/sol-collector.ts` is alive in the current executor session. It checks balances every 15 minutes and stores per-endpoint attempt timestamps in ignored `.state/sol-collector.json`; both successful and failed faucet attempts back off for eight hours. The state survives process restarts within this workspace, but the process itself will stop if the executor is torn down. Durable operation requires the requested Railway backend deployment, currently blocked by the missing Railway token. Allowed real-data/funding alternatives are limited to the public devnet RPC, the supplied QuickNode devnet endpoint when credentials are available, or an account holder using the official Solana faucet. No proxy, VPN, mainnet funds, or fabricated balance is used.

## Deployment identifiers

- Solana program ID: pending
- Test USDC mint: pending collector funding
- Railway backend: pending
- Vercel frontend: pending
- QuickNode Stream: pending deployed program transaction, verified test-filter response, backend URL and credentials
- Public GitHub branch/commit: pending

WP2 currently uses the build-time ID `EBfYyDsDq4rEL9hqi7CwbM3rW1zYvBAfdRcWLdbWeMxi` so native compilation and clients have a non-system program identity. It is **not deployed**. Before deployment, generate the actual program keypair, run `anchor keys sync`, rebuild/export the generated IDL into `packages/shared`, deploy to devnet, and verify the executable account via RPC. The current environment has no funded deploy authority and no Solana/Anchor CLI, so no deployment claim is made.

## Account-holder actions at submission

1. Upload `demo/wick-demo.mp4`.
2. Paste `docs/DEVPOST.md` into Devpost.
3. Submit before Friday, November 20, 2026 at 12:00 PM CST.
