# Wick deployment runbook

Wick is not deployed. This runbook is intentionally fail-closed: a command returning, a provider accepting a build, or a URL existing is not proof that the product works. Do not record a deployment until the provider reports terminal success and `pnpm deploy:verify` passes against public URLs.

Run `pnpm deploy:check` before every attempt. It reports only presence/absence, never credential values. `pnpm deploy:check --require-ready` is the CI/operator gate and exits non-zero while any prerequisite is absent.

## 1. Solana devnet program and accounts

Required tooling is Anchor 0.31.1, Solana 2.2.20, SPL Token CLI, and Rust 1.85.1. Required inputs are funded devnet-only admin/keeper/treasury keypairs plus a one-time mint-authority keypair used only during provisioning. Never commit a keypair.

1. Fund the treasury with at least 8 devnet SOL and keep the deploy authority funded. The internal escalation time is Wednesday, November 18 at noon CST.
2. Generate or restore `target/deploy/wick-keypair.json`, set `PROGRAM_ID` to its public key, run `anchor keys sync`, and confirm `Anchor.toml` and `declare_id!` agree.
3. Run `anchor build`. `pnpm sync:idl` then refuses an empty IDL and exports the real instruction-bearing IDL to `packages/shared/src/idl.ts`. `pnpm deploy:program` performs both steps and refuses a keypair/program-ID mismatch.
4. Deploy to devnet with the build plus 20% maximum program length. The deployment script verifies the returned account is executable before logging success.
5. Run `pnpm create:mint`. It creates or migrates the six-decimal `USDC_TEST_MINT`, mints the remaining amount up to exactly 200 grants (200,000 test USDC) into the treasury ATA, and permanently revokes both mint and freeze authorities in the final provisioning transaction. Confirm the read-back reports `remainingGrants`, `mintAuthorityRevoked: true`, and `freezeAuthorityRevoked: true`. Keep `FAUCET_AUTHORITY_KEYPAIR` only until this succeeds; remove it from deployment environments afterward. Re-running the command verifies the finite inventory and cannot refill it.
6. Run `pnpm init:config`, then verify config, vault, LP state, keeper, and mint accounts through RPC. A build-time ID is not a deployed-program claim.

Current blocker: Solana, Anchor, and SPL Token CLIs, deploy artifacts, funded keypairs, program ID, mint, and devnet SOL are absent. The build-time ID in `Anchor.toml` is not deployed.

## 2. Railway backend

Required inputs are an authorized existing Railway project token, the deployed program/mint, keeper keypair, webhook secret, and a real chain adapter. The backend selects a real Anchor transport only after validating the generated IDL, executable devnet program and configured keeper. With those inputs absent it uses `UnconfiguredChainPort`; do not present that read-only state as a working trading service.

1. Use the repository root as build context; `services/backend/railway.json` selects `services/backend/Dockerfile`. Do not set a restrictive monorepo root directory.
2. Attach one 1 GB persistent volume at `/data`. Set `SQLITE_PATH=/data/wick.db`.
3. Set `SOLANA_CLUSTER=devnet`, public/QuickNode RPC endpoints, `PROGRAM_ID`, `USDC_TEST_MINT`, `KEEPER_KEYPAIR`, `STREAMS_WEBHOOK_SECRET`, provider URLs, and `VOL_SOURCE`. Pass secrets via the provider's secret/variable mechanism, never command output or git.
4. Generate a public HTTPS domain. Keep the health check at `/health` and restart policy `ALWAYS`.
5. Deploy using an authorized Railway token. A detached upload is only queued: poll deployment status until it is terminal `SUCCESS`. Treat `FAILED`, `CRASHED`, `REMOVED`, or a timeout as failure.
6. Verify `/health` reports `ok`, `cluster: devnet`, healthy volatility, and `chainConfigured: true`; then record the public URL and Railway CPU/RAM/credit usage in `docs/HANDOFF.md`.

Current blocker: Railway CLI/token/project context are absent, and deployed chain inputs are absent. Railway connector authentication has been verified, but no Wick service was created while source publication remains approval-blocked. No Railway service or domain was created.

## 3. Vercel frontend

1. Set `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_PROGRAM_ID`, `NEXT_PUBLIC_USDC_TEST_MINT`, `NEXT_PUBLIC_RPC_URL`, and `TREASURY_KEYPAIR` in the authorized project. Only the treasury key is a server-only runtime secret. Do **not** deploy `FAUCET_AUTHORITY_KEYPAIR`; provisioning has permanently revoked it.
2. Deploy from the repository root with `vercel deploy --prod`; `vercel.json` builds `@wick/app` from the monorepo.
3. Wait for the deployment to reach a terminal ready state. Verify `/`, `/m/<live-symbol>`, `/portfolio`, `/pool`, and the safe faucet response in a fresh browser. Before the grant, verify the mint supply is exactly 200,000,000,000 base units, both authorities are `null`, and the treasury ATA holds at least 1,000,000,000 base units. Afterward verify the single signature contains both the 0.05 SOL transfer and the 1,000 test-USDC transfer. Record only the canonical production URL.

The ten-minute browser/IP cooldown and in-flight set are best-effort controls scoped to one warm Vercel instance; they are not a distributed identity or abuse boundary. The hard global bound is the finite treasury token inventory: no runtime key can mint or freeze more test USDC, and concurrent functions race on the same on-chain balance, so an overdraw transaction fails atomically without sending its paired SOL transfer.

Current blocker: Vercel CLI/token/project context, public backend URL, program/mint, and funded faucet keypairs are absent. No Vercel project or URL was created.

## 4. QuickNode Stream (only after 1–3)

Creating a Stream before a real Wick transaction would spend credits without qualifying evidence. Wait until the program has a successful devnet transaction and the Railway HTTPS webhook accepts authenticated events.

1. Set `QUICKNODE_API_KEY`, `QUICKNODE_RPC_URL`, `PROGRAM_ID`, `NEXT_PUBLIC_BACKEND_URL`, `STREAMS_WEBHOOK_SECRET`, and the real transaction block as `STREAMS_TEST_BLOCK`.
2. Run `pnpm create:stream -- --test-only`. It substitutes the deployed program ID, tests the filter against that real block, and saves the response. It must contain a matched Wick transaction.
3. Run `pnpm create:stream` once. Record the returned Stream ID. Confirm it is active, network `solana-devnet`, dataset `block`, filter matches Wick and skips failed transactions, and destination is the authenticated backend webhook.
4. Submit a real program transaction and require it at `/feed` within roughly two seconds. Only then may the README/HANDOFF checklist be marked complete.
5. One hour later, read QuickNode usage and project burn through Saturday, November 21 at 11:59 PM CST. If projected usage exceeds 8M credits, enable the specification's on-demand pause/resume policy and record the measurement and decision.

Current blocker: QuickNode credentials/RPC, a deployed program transaction/block, public backend URL, webhook secret, and successful real filter-test fixture are absent. No Stream was created.

## 5. Public verification and deadlines

Run `pnpm deploy:verify` only with the final `PROGRAM_ID`, `USDC_TEST_MINT`, `NEXT_PUBLIC_BACKEND_URL`, and `FRONTEND_URL`. It checks devnet, executable program, six-decimal mint, chain-enabled backend health, a live 15-minute market, a recent Stream-backed feed event, and frontend content.

- Internal complete-and-verified target: Thursday, November 19, 2026 at 11:59 PM CST.
- Official Devpost submission close: Friday, November 20, 2026 at 12:00 PM CST.
- Final presentation eligibility: finalists must be present in person; finals are in Austin on Saturday, November 21. Confirm team logistics before submission.

