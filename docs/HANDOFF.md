# Wick handoff

Last updated: 2026-11-16 (UTC)

## Progress

- WP0: code complete and locally verified — monorepo, pinned toolchain, CI, shared API contracts and conservative devnet SOL collector created. Shared tests and strict TypeScript checks pass. Collector is running, but funding/mint creation is blocked as described below.
- WP1–WP3 and WP5–WP11: not started on this branch.
- WP4: complete on branch `wp4/vol` — `packages/vol` implements Deribit REST/WebSocket, Derive v3 REST polling, EWMA realized-vol fallback, cubic-smile and total-variance interpolation, strict five-second health checks, retry/timeouts, and priority auto-fallback with logged switches. Seven deterministic tests pass, including simulated Deribit startup failure → Derive selection. Repository-wide strict TypeScript validation passes. Live checks verified healthy Deribit and Derive surfaces; details are in `docs/FINDINGS.md`.

## Credentials and deployment blockers

The current environment does not expose `GITHUB_TOKEN`, `QUICKNODE_API_KEY`, `QUICKNODE_RPC_URL`, `RAILWAY_TOKEN`, or `VERCEL_TOKEN`. Public repository cloning works, but authenticated pushes and sponsor deployment/configuration cannot proceed until the applicable credentials are available. No credential values have been printed or stored in the repository.

The environment also lacks local Rust, Solana, Anchor and SPL Token CLIs. CI pins Rust 1.85.1, Solana 2.2.20 and Anchor 0.31.1; local installation is still required for program build/deploy work.

The public Solana devnet RPC returned HTTP 410 with "The RPC faucet is closed on this cluster" on the first collector attempt. No QuickNode RPC URL is present, so the collector has no second faucet. Current public addresses and confirmed balances:

- Treasury: `B4nEhYCDBaX7pejdVrXxaF1U2QftfLjK6vEk7NL64W95` — 0 SOL
- Keeper: `HNERJLwksoZtDeuAikaxHk4ipJUWj7d38GWYsoD93Ymo` — 0 SOL
- Demo-wallet funder: `4hViJTPMJ3jMqAbnLaHFg2iEqQsMhkhXtLMCs6J27zPD` — 0 SOL

Required account-holder action if automated funding remains unavailable by Wednesday November 18 noon CST: sign in to `faucet.solana.com` with GitHub and send at least 8 devnet SOL to the treasury address above. The test-USDC mint cannot be created until the treasury has SOL for rent and fees.

## Deployment identifiers

- Solana program ID: pending
- Test USDC mint: pending collector funding
- Railway backend: pending
- Vercel frontend: pending
- QuickNode Stream: pending
- Public GitHub branch/commit: pending

## Account-holder actions at submission

1. Upload `demo/wick-demo.mp4`.
2. Paste `docs/DEVPOST.md` into Devpost.
3. Submit before Friday, November 20, 2026 at 12:00 PM CST.
