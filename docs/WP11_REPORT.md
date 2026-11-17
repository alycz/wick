# WP11 independent verification report

Review date: 2026-11-17 UTC. Reviewer started from `96dc9b8` on `wp11/e2e` in the dedicated `wick-wp11` checkout, without prior implementation history. Entire root `BUILD_SPEC.md` and the requested handoff, README, deployment, eligibility and demo documents were read before code changes. No repository `.agents/skills` or `AGENTS.md` exists in this checkout.

**Verdict: NOT COMPLETE. Zero open failures has not been achieved. No deployment is verified or claimed.** This file substitutes for external GitHub issues under the delegated review instruction; no external issue was filed. Findings are local review evidence, not claims of an executed on-chain exploit. No secrets or authority key material were printed.

## Initial verification at `96dc9b8`

| Check | Observed result |
|---|---|
| Cached dependency install | `pnpm install --frozen-lockfile --offline`: passed; 891 cached packages, no lockfile change |
| Lint and strict TypeScript | `pnpm lint`: exit 0, ESLint reports no warnings/errors |
| Package and script tests | `pnpm test`: exit 0; 59 total tests (shared 2, pricing 17, Gemini 9, vol 7, backend 9, app 3, scripts 12) |
| Optimized production build | `pnpm build`: exit 0, backend TypeScript and all Next.js routes built |
| Native Rust | `cargo test -p wick --offline`: exit 0, 6 tests; Anchor macro cfg/deprecation warnings; no instruction execution coverage |
| Public Gemini read-only check | `pnpm --filter @wick/gemini check:live`: exit 0; real `GEMI-BTC15M2611170030-UP` quote emitted (bid .01, ask .08, mid .045) |
| Public volatility read-only check | `pnpm --filter @wick/vol live-check`: exit 0; Deribit healthy (11 expiries / 491 points), Derive healthy (2 expiries / 54 points) |
| Devnet identity before repair | Public RPC returned `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`; `assertDevnet` rejected it because its expected literal was truncated |
| Devnet identity after repair | Literal regression suite 3/3 passed; `assertDevnet(new Connection("https://api.devnet.solana.com"))` passed without any transaction. A second RPC query confirmed full hash decodes to 32 bytes; the short CAIP-2 reference decodes to 24 |
| Demo gate | `pnpm demo:check`: exit 1, `NEXT_PUBLIC_BACKEND_URL is required` |
| Readiness gate | `pnpm deploy:check --require-ready`: exit 1, `allReady:false` for program/backend/frontend/Stream |
| Public verification gate | `pnpm deploy:verify`: exit 1, `PROGRAM_ID is required` |
| Backend production smoke test | After successful build, `PORT=4189 SQLITE_PATH=/tmp/wick-wp11-production.db pnpm --filter @wick/backend start`: exit 1, missing `packages/gemini/src/client.js` |
| Browser availability | Managed browser exists. Reviewed production frontend reported ready on port 4174, but the managed browser twice returned `net::ERR_CONNECTION_REFUSED` for `http://127.0.0.1:4174/`. No independent visual pass is claimed |
| Anchor localnet | Anchor/Solana/SPL Token CLIs unavailable; no root `tests/` exists. Running the configured `pnpm exec vitest run tests` instead matches unrelated package tests and fails with frontend alias and cwd-dependent filter-path errors |

The root Vitest invocation above is distinct from the passing supported `pnpm test` command. Its failures show that the configured Anchor test command does not supply the required local-validator instruction suite.

## Final rerun at `88fc9ba`

All authorized repair branches were integrated before final review. The full-hash regression remains in this WP11 branch. A duplicate exact-optional-property fix was replaced with the identical parent commit `88fc9ba` before sign-off.

| Final check | Observed result |
|---|---|
| Dependency refresh | Frozen offline install passed; no lockfile edits |
| Lint / strict TypeScript | Passed, exit 0; no ESLint warnings/errors |
| Package/script tests | Passed, 94 total: shared 2, pricing 18, Gemini 9, vol 7, backend 26, app 13, scripts 19 |
| Production build | Passed, exit 0; backend compiler and all six Next.js pages/routes |
| Native Rust | Passed, 15/15; Anchor macro cfg/deprecation warnings remain |
| Backend production start | Production-entrypoint regression launched the actual `node --import tsx src/main.ts` command and observed `Server listening at`; no workspace module-resolution failure |
| CORS probe | Configured exact origin: 200 with matching allow-origin; unconfigured origin: 403 with no allow-origin |
| Engine rediscovery probe | Expired contract retained through active discovery removal; official-outcome settlementCalls changed from 0 to expected 1 |
| Confirmed mark probe | Failed update leaves reported lastMarkAt at the actual previous confirmation, rather than advancing with local pricing |
| Two-sided cap probe | At p_yes .99, sigma .5, 30 days, shared cap is 90 (the minimum of YES 1000 / NO 90) |
| Real devnet identity | Full observed hash accepted again; no transaction submitted |
| Anchor lifecycle command | `pnpm test:anchor:local`: exit 1; before-hook cannot read `target/idl/wick.json`; all nine cases cancelled. No instruction/validator pass is claimed |
| Demo gate | `pnpm demo:check`: exit 1, `NEXT_PUBLIC_BACKEND_URL is required` |
| Readiness gate | `pnpm deploy:check --require-ready`: exit 1, `allReady:false`; program/backend/frontend/Stream each lack documented prerequisites |
| Public deployment gate | `pnpm deploy:verify`: exit 1, `PROGRAM_ID is required` |
| Public lifecycle / recording | Not attempted with invented identifiers or local substitute URLs. No verified public endpoints, funded chain, active Stream or MP4 exist |

**Final count: 29 registered findings; 22 code findings resolved locally; 7 remain open or partially open. WP11 acceptance is not achieved.** Local code resolution does not imply deployment validation. Supporting command logs are local `/tmp/wick-wp11-final-{lint,tests,build,rust,demo,readiness,deploy}.log`; the report carries their material outcomes so ephemeral logs are not required to understand the verdict.

## Failure register

Severity: P0 blocks the required demo/submission; P1 is a correctness or safety defect; P2 is a completeness, reliability or evidence defect. Status remains open until the relevant repair is independently rerun. Parent-owned repair commits may supersede observations below; their final state must be recorded before sign-off.

| ID | Severity | Owner WP | Failure / exact evidence | Status |
|---|---|---|---|---|
| W11-01 | P0 | WP2/WP9 | No generated instruction-bearing IDL, SBF artifact, funded deployment authority, configured program/mint or verified executable program. Reproduce with `pnpm deploy:check --require-ready` | Open / deployment blocked |
| W11-02 | P0 | WP5 | `services/backend/src/main.ts` unconditionally constructs `new UnconfiguredChainPort()`; its only implementation rejects every chain operation. Configuring credentials alone cannot enable marks, liquidations or settlement | Resolved locally: `createChainPort` selects a validated Anchor transport; chain regressions pass. Real deployed operation remains gated by W11-01/18 |
| W11-03 | P0 | WP7 | `app/lib/chain.ts` returns a transaction-builder-unavailable error even after all configuration checks. Trade, portfolio claim/close and pool action handlers merely display that error | Resolved locally: real signing/submission/confirmation builders are wired; app transaction tests pass. Public flow remains W11-18 |
| W11-04 | P0 | WP9 | `services/backend/package.json` starts compiled output with plain Node while workspace package exports reference TS source with `.js` internal imports. Actual production start exits `ERR_MODULE_NOT_FOUND` for `packages/gemini/src/client.js` | Resolved locally: runtime uses tsx as a production dependency; actual production-entrypoint startup test passes |
| W11-05 | P1 | WP5/WP7 | No CORS configuration exists for the separate Vercel/Railway origins. Fastify injection of GET `/markets` with Origin `https://wick-example.vercel.app` returned status 200 and `access-control-allow-origin:null`; SSE writes headers directly with no CORS headers | Resolved locally: exact-origin CORS/SSE support and browser-webhook refusal; tests plus independent injection probe pass |
| W11-06 | P1 | WP2 | Fixed-point liquidation boundary differs across languages: entry 500000, leverage 6, maintenance 0 gives TS 416666 and Rust-expression 416667. Rust divides the loss fraction before multiplying; TS divides once at the end | Resolved locally: Rust now divides once at the end; explicit boundary and 1,000-vector native regressions pass |
| W11-07 | P1 | WP2 | Losing settlement and a sufficiently adverse close credit LP/emissions with losses greater than deposited margin. At margin 100 USDC, leverage 10, entry .5, losing settlement computes -1000 USDC PnL; `settle_position` sends that full amount to `apply_lp_pnl` and emissions while payout alone clamps to zero. TS `closeResult.lossE6` correctly caps loss at margin | Resolved locally: realized losses are capped to margin before LP/emission/event accounting; Rust regressions pass |
| W11-08 | P1 | WP2 | `liquidate` checks position status and last mark only, without checking market status. After `settle_market` or `void_market`, a still-open position satisfying the old mark boundary can be liquidated before `settle_position`, defeating the official outcome/refund | Resolved locally: liquidation requires Open market status; native status regression passes |
| W11-09 | P1 | WP7 | Faucet constructs a connection then reads mint and transfers SOL/mints tokens without verifying devnet genesis; success is labelled `cluster:devnet` unconditionally. A misconfigured RPC with controlled six-decimal mint passes its stated checks | Resolved locally: full devnet hash is checked before other faucet RPC or submission; wrong-network refusal regression passes |
| W11-10 | P2 | WP7 | Faucet ten-minute/global grant accounting is process-local. `browserId:ip` is freely changeable, separate Vercel instances do not share counters, and concurrent distinct grants can all read the same mint supply before submitting. The supply precheck is not an atomic 200-wallet cap | Partially resolved / OPEN P2: mint/freeze authorities are revoked after exactly 200 grants are provisioned; transfers consume finite inventory atomically. Ten-minute cooldown remains process-local/best-effort and does not satisfy a distributed per-browser guarantee |
| W11-11 | P1 | WP2 | Required Anchor instruction/localnet coverage is absent. `Anchor.toml` calls `vitest run tests`, but no root tests exist. Six native Rust tests cover math/id only; the 1000 TS/Rust cases are separate local calculations, not the required exact on-chain-vs-TS property test | Partially resolved / OPEN validation: nine-case localnet harness, exact 1,000-vector on-program check and CI wiring exist; execution is blocked by absent generated IDL/SBF/Anchor/Solana validator tooling |
| W11-12 | P2 | WP2/WP10 | `staker_cap` is stored and updated but never used for surplus distribution. README/Pool copy currently says eligible LP surplus accrues to stakers; implementation only distributes newly added fee shares when queue is empty | Resolved locally: surplus above staker_cap is queue-prioritized and distributed with tested arithmetic. Separate deferred-fee limitation is W11-28 |
| W11-13 | P0 | WP6/WP9 | No active Stream ID/status, real filter-test fixture, deployed transaction, public authenticated destination or measured delivery. `pnpm deploy:check --require-ready` reports every prerequisite absent | Open / QuickNode unselectable |
| W11-14 | P2 | WP6/WP9 | Ingestion stores no provenance distinguishing webhook from RPC gap filler. `indexerConfigured` is only secret+program presence; `demo-check` and `deploy:verify` accept any recent feed event. These gates cannot prove that Streams is the core source or satisfy the README claim of a Stream-backed verification | Resolved locally: durable provenance distinguishes quicknode_stream/rpc_reconcile; health and verification gates require recent Stream evidence; redelivery tests pass |
| W11-15 | P2 | WP6 | `create-stream.ts` logs an active Stream after POST without verifying returned/terminal status, and substitutes string `created` if no ID is present. A successful HTTP response alone is not terminal active-status evidence | Resolved locally: missing ID/status is rejected, terminal inactive states fail, non-active creation is polled; script regressions pass. No real provider response is claimed |
| W11-16 | P2 | WP6 | `decodeLogs` decodes every `Program data:` line with matching event discriminator without tracking program invocation ownership. A transaction containing Wick plus another program can attribute the other program's matching event bytes to Wick; no program identity is passed to the decoder | Resolved locally: configured ingestion tracks invocation ownership and ignores other/CPI program event bytes; scope regression passes |
| W11-17 | P2 | WP6 | Authenticated webhook acknowledges before any durable write, then only logs ingestion failure. A crash between ACK and `setImmediate`, or a later SQLite failure, loses acknowledged data until the limited 100-signature gap filler happens to recover it | Resolved locally: authenticated delivery is durably enqueued before ACK and retried from SQLite after projection failure; durable-retry tests pass |
| W11-18 | P0 | WP8/WP10 | No real 30-minute bot run, positive funded vault, full public fresh-browser lifecycle, liquidation/official settlement recording or `demo/wick-demo.mp4`. These require actual deployment and cannot be replaced with fixture footage | Open / submission blocked |
| W11-19 | P2 | WP8/WP10 | Recorder treats any new opened/liquidated/settled feed text as its evidence, without correlating signature/market. Clamp-text wait suppresses failure with `.catch(() => undefined)`, so it does not prove the 1000x attempt was clamped. Uniform time rescaling also does not align footage to the promised per-shot caption intervals | Resolved locally: recorder requires correlated transaction/market/position evidence, asserts clamp, and captions observed transitions without changing playback speed; six script tests pass. Actual MP4 remains W11-18 |
| W11-20 | P1 | WP0/WP8 | Truncated expected devnet genesis rejected the real network, blocking collector/deploy/init/bots/demo checks | Resolved locally: full RPC hash is retained and checked with independent literal, rejected short prefix, and actual public RPC |
| W11-21 | P0 | WP0/WP9 | Missing configured deployment contexts and public URLs prevent deployed lifecycle verification. Collector durable operation remains unverified; backend main does not start the collector. Railway connector tools are available but their account/project authorization has not been established by this reviewer | Open / infrastructure blocked |
| W11-22 | P2 | WP2/WP6 | Profitable settlement fees are absent from the pool fee projection: `PositionSettled` emits no `fee_e6`; indexer `addFees` handles only close/liquidation; `LpUpdated` has no fee totals. Reproduce with a profitable settlement event and inspect `/lp/history` fees | Resolved locally: settlement emits fee_e6 and projection adds it idempotently; profitable-settlement/redelivery regression passes |
| W11-23 | P2 | WP2 | Paid claim accounts have no close instruction or Anchor `close` constraint. Close/settle also initialize claim accounts when no shortfall exists. Required claim rent reclamation is not implemented | Resolved locally for paid claims: conditional closure validates recipient/index/bump and refunds owner; partial claims stay open; native regressions pass |
| W11-24 | P0 | WP7 | Frontend repair defaults config helpers to aliased `environment = process.env`, preventing Next public-variable inlining. Compiled repair chunk `896-838306fb44eb801d.js` defaults to `d.env` then dynamically reads `r.NEXT_PUBLIC_PROGRAM_ID`; a configured browser would still see a missing ID. [Next 14 documentation](https://nextjs.org/docs/14/app/building-your-application/configuring/environment-variables#bundling-environment-variables-for-the-browser) explicitly excludes aliased env lookups from inlining | Resolved locally: explicit literal NEXT_PUBLIC reads support Next inlining; final production build succeeds. Type follow-up is W11-29 |
| W11-25 | P1 | WP5 | Shared market leverage cap is computed from YES probability only and applied to NO too. Isolated fixture probe at 30 days, sigma .5, p_yes .99 yields YES cap 1000 but NO cap 90; current common cap is 1000 | Resolved locally: min(YES, NO) shared cap is used by engine; pricing regression and independent 90x probe pass |
| W11-26 | P0 | WP5 | Discovery replaces candidates with active contracts; settlement only scans that same map. Probe removes an expired 15-minute contract during rediscovery then returns its official settled outcome: settlementCalls stays 0 (expected 1). Expired unresolved markets also lack restart recovery. Additionally, a failed position crank after confirmed settleMarket retries the non-idempotent market settlement instead of resuming the crank | Resolved locally: pending settlement recovery/staging survives active discovery removal and retries only remaining cranks; backend regressions and independent rediscovery probe pass |
| W11-27 | P1 | WP5/WP8 | `markOnce` sets `lastMarkAt` on local pricing before confirmed chain submission. Isolated probe makes chain update fail: true last confirmation remains 1794869400000, reported freshness advances to 1794869410000(now), allowing false-fresh health/demo evidence | Resolved locally: health lastMarkAt advances only after a confirmed batch; regression and independent failed-update probe pass |

For W11-06, the independently executed comparison was `liquidationMarkE6(500000,6)` versus the exact Rust expression `500000n*(1000000n-1000000n/6n)/1000000n`, yielding 416666 and 416667. For W11-07/08/09/10/12/16/17, evidence is direct code-path inspection, not a claim of a public execution or attack. Do not use non-devnet endpoints or real assets to demonstrate W11-09.

The full RPC hash is also documented by [Anza cluster configuration](https://docs.anza.xyz/clusters/available). [Solana's protocol-identifier documentation](https://solana.com/docs/payments/agentic-payments/x402) distinguishes shortened CAIP-2 references from complete RPC genesis hashes. Never substitute the shortened reference in a full-string `getGenesisHash` safety comparison.

## Remaining code limitations and approval blocks

| ID | Severity | Owner WP | Finding | Status |
|---|---|---|---|---|
| W11-28 | P2 | WP2 | Fee shares earned while payout claims are queued remain in fees_stakers but are never assigned to reward_per_token after the queue clears. The new code explicitly documents the missing undistributed-reward cursor; surplus distribution alone does not close this accrual gap | OPEN; requires an account-layout/reward-accounting change and validation |
| W11-29 | P1 | WP7 | At 7ac71dd, final lint failed TS2375 because explicit undefined public env values were assigned to exact optional string fields | Resolved by parent 88fc9ba; final lint and production build pass |

W11-28/29 are additional rows of the failure register (separated here for readability). Provisioning a finite faucet inventory fixes the hard global funding bound, but does not close W11-10's distributed cooldown. Paid-claim rent recovery is implemented; unused zero-amount claim accounts created for a no-shortfall close are not separately reclaimed until that claim index is used.

For W11-21, the orchestrator reported this exact denied action and outcome (this reviewer did not retry it): add `services/backend/src/collector/service.ts` plus lifecycle wiring to refactor the existing devnet-only collector into the backend process, read configured keypairs, call `requestAirdrop`, and transfer treasury devnet SOL to keeper/funder. First auto-review denial said automated funding/financial side effects lacked trusted exact authorization. The retry supplied BUILD_SPEC §10.2 line 345 and WP0 line 368 evidence; the second denial said authorization arrived through assistant/delegation text rather than trusted user content, so explicit trusted-user approval is required. Both attempts made no file edits, faucet calls or transfers. The standalone collector is preserved, but persistent operation is not verified.

The orchestrator also verified Railway connector authentication against existing unrelated projects, but created no Wick infrastructure. `gh auth status` is unauthenticated. Publishing `git push origin main` was auto-denied because destination/publication side effects were insufficiently explicit; no push occurred. Browser access to GitHub settings/keys was auto-denied as a credential-exposure risk. No Vercel tool/token is available. These are reported approval/access blockers, not evidence that deployment or publication occurred.

## Safety and claim review

Devnet-only copy, readable unconfigured errors, ignored keypair/environment files, checked arithmetic, webhook secret comparison, fixture separation and conditional sponsor wording are present. No fake market rows are shipped by the frontend. Resolved local defects are identified in the register; the remaining limitations and all public validation gates stay open. The README correctly says no deployment exists, but its broad implemented/local-checks-complete wording must be read with this report; it does not establish missing instruction or deployed lifecycle coverage.

## Official guide and prize assessment

The entire official [Google Doc guide](https://docs.google.com/document/d/1QaySCo7u3VxMVNdk3C5Ab3ewc2E46AuLntti-Uzx5EY/edit) was retrieved through its public text export and read, along with the [organizer page](https://www.universityblockchain.org/programs/hackathon) and [Devpost rules](https://ubc-hackathon-2026.devpost.com/rules).

The guide requires one main track, at most one chain award, a working demo, public source/setup/README and accessible 2–3 minute video. QuickNode specifically requires Streams as a core source plus a configured filter/destination and README configuration rationale. Existing RPC/collector/reconciliation work does not establish that evidence. The implemented webhook/filter/store can support Streams within the build architecture, but actual network/API response compatibility, provider active status, public delivery and latency remain unverified. Provenance and active-status gates now have local regression coverage. Do not select QuickNode now. Track 02/Solana/Gemini remain conditional on a working submission; Gemini API code alone does not complete the main-track lifecycle.

Internal target remains Thursday November 19, 2026 at 11:59 PM CST. Official cutoff is Friday November 20 at noon CST. In-person Austin finalist attendance remains an account-holder logistics requirement.

## Submission assets

README, architecture, five Devpost answers, exact demo storyboard/captions and deployment handoff are present. Verified public URLs/program/mint/Stream, a public final source commit, team/form review, video artifact/link and actual account-holder upload/submit remain incomplete. No MP4 was fabricated. Account holders retain the upload and submit actions.

## Required rerun

After repairs, rerun lint, tests, build, production backend start, regression probes, generated-IDL/SBF/local-validator tests and `demo-check`. Then verify real program/mint/URLs/Stream and execute the entire deployed fresh-browser lifecycle. Only verified outcomes may close findings. A passing local suite is not WP11 acceptance.
