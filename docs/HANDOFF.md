# Wick handoff

Last updated: 2026-11-16 (UTC)

## Progress

- WP0: code complete and locally verified — monorepo, pinned toolchain, CI, shared API contracts and conservative devnet SOL collector created. Shared tests and strict TypeScript checks pass. Collector is running, but funding/mint creation is blocked as described below.
- WP1: not started on this branch.
- WP2: implemented on `wp2/anchor` — Anchor accounts, instructions, checked fixed-point math, events, payout queue, emissions and staking. Native Rust compile/tests pass. Full Anchor local-validator tests, generated IDL and devnet deployment remain blocked pending the pinned Solana/Anchor CLI toolchain and funded devnet deploy authority.
- WP3–WP11: not started on this branch.

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

WP2 currently uses the build-time ID `EBfYyDsDq4rEL9hqi7CwbM3rW1zYvBAfdRcWLdbWeMxi` so native compilation and clients have a non-system program identity. It is **not deployed**. Before deployment, generate the actual program keypair, run `anchor keys sync`, rebuild/export the generated IDL into `packages/shared`, deploy to devnet, and verify the executable account via RPC. The current environment has no funded deploy authority and no Solana/Anchor CLI, so no deployment claim is made.

## Account-holder actions at submission

1. Upload `demo/wick-demo.mp4`.
2. Paste `docs/DEVPOST.md` into Devpost.
3. Submit before Friday, November 20, 2026 at 12:00 PM CST.
