# Wick

Every Gemini strike, at fair value.

Wick is a Solana devnet hackathon build for leveraged synthetic Gemini prediction markets. The implementation is in progress; see [BUILD_SPEC.md](BUILD_SPEC.md) for the complete product contract and [docs/HANDOFF.md](docs/HANDOFF.md) for verified status and blockers.

## Deployment status

Wick is **not deployed**. The build-time program ID is not an executable devnet deployment, and there are no Railway, Vercel, or QuickNode Stream URLs/IDs to report. Use the fail-closed [deployment runbook](docs/DEPLOYMENT.md) and [eligibility checklist](docs/ELIGIBILITY.md); `pnpm deploy:check` prints exact missing prerequisites without printing their values.

## QuickNode Streams architecture (conditional)

The intended core event path is Solana devnet **blocks** → QuickNode Stream → `streams/filter.js` → authenticated Railway `/streams/webhook` → SQLite projections → activity feed, positions, leaderboard, and LP history. The filter matches top-level or inner instructions for the deployed Wick program, skips failed transactions, and retains signatures, slots, block times, and program logs. This push path is designed to provide low-latency program events; the labelled 60-second RPC job is reconciliation only.

That architecture does not yet represent a live integration: a Stream may be created only after a real deployed-program transaction matches the QuickNode test endpoint and the public backend webhook exists. Network, dataset, filter, destination, Stream ID, and observed event latency must all be verified before Wick claims Streams eligibility.
