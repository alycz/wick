# Wick demo runbook, storyboard and captions

## Current status

As of November 18, the frontend is deployed at [wick-markets-phi.vercel.app](https://wick-markets-phi.vercel.app/) and returned HTTP 200. No verified final demo MP4 or end-to-end public devnet trading lifecycle is recorded here. Frontend availability must not be represented as verified program/backend/faucet/QuickNode execution. `scripts/record-demo.ts` is deliberately fail-closed: it runs real devnet bots and `demo-check`, records a configured deployment only, waits for real open/liquidation/settlement events, and emits `demo/wick-demo.mp4` only after Playwright and ffmpeg succeed.

Target runtime is **2–3 minutes**. Every shot below must use the final public deployment and real devnet/test assets. Do not splice in fixture data, edit browser state, seed fake feed entries, or alter playback speed.

## Recording gate and command

Required environment includes the final `PROGRAM_ID`, `USDC_TEST_MINT`, public backend/frontend URLs, funded devnet authorities, generated IDL, chain-enabled backend, webhook secret, RPC configuration, and active verified Stream.

Run these gates in the same environment that will record:

```bash
pnpm deploy:check --require-ready
pnpm deploy:verify
pnpm demo:check
DEMO_URL="$FRONTEND_URL" DEMO_BOT_MINUTES=2 pnpm demo:record
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 demo/wick-demo.mp4
```

Expected final duration is between `150` and `180` seconds. The recorder itself runs the real bots and `demo-check` again before opening Chromium. It captures the browser's exact `sendTransaction` signature, reads that transaction's market and position accounts back from devnet RPC, and accepts only Stream events correlated to that evidence. If any prerequisite, transaction, alert, live cap, correlation, liquidation, settlement, timeline, video, caption or encoding step fails, stop and fix the system; do not make an alternate simulated video.

## Historical UI labels and current acceptance boundary

The storyboard below was written before the November 18 redesign. Labels such as **Try it now**, the right activity rail and the devnet footer describe that earlier UI, not verified current controls. Before recording, reconcile `scripts/record-demo.ts` with the current routes, accessible names and evidence surfaces, and verify the real browser flow. Do not remove transaction correlation, real Stream events, settlement, funding or timing gates merely because the redesigned layout changed. A CI or frontend deployment success does not satisfy these recording gates.

The browser-only practice account is not the devnet demo path for this recording. Its `demo-receipt-*` values, local balance changes, positions and staking actions must never be used as transaction, explorer, settlement, pool-solvency or QuickNode Stream evidence. The recorder must use a connected/local devnet wallet and retain the existing chain/RPC/Stream correlation gates.

## Planned storyboard (UI labels require revalidation)

| Time | Shot and action | Evidence visible |
|---:|---|---|
| 0:00–0:18 | Open the deployed markets page on the current BTC 15-minute hero. Frame spot, strike, countdown, Wick theo, Gemini bid/ask, edge and live cap. | Production HTTPS URL; current contract; live values rather than placeholders. |
| 0:18–0:38 | Switch Tail ladder to Weekly and scan strikes from near money into a thin tail. Pause on missing/one-sided Gemini liquidity beside Wick theo. | Multiple real Gemini strikes, tails, vol-source badge and per-row cap. |
| 0:38–1:00 | Click **Try it now**, show the “Demo wallet, devnet only” banner, then request the faucet grant. | Fresh browser-local address and one confirmed grant of 0.05 devnet SOL + 1,000 test USDC. Never expose authority keys. |
| 1:00–1:24 | Enter the live 15-minute trade screen. Request exactly 1000x and show both the slider's capped value and visible live-cap text; review entry, contracts, max payout and liquidation distance; open YES at the cap. | An asserted clamp in the real UI and a confirmed Wick transaction whose full signature is captured from browser RPC. |
| 1:24–1:48 | Keep the right activity rail visible until **Position opened** appears. Show the transaction link/feed item. | A `PositionOpened` Stream event whose signature, market and position exactly match the submitted transaction. |
| 1:48–2:12 | Let bot/live activity continue until **Liquidation** appears; briefly show current mark/cap and portfolio status. | A `PositionLiquidated` Stream event for that exact position, not a similarly named unrelated feed item. |
| 2:12–2:32 | Wait for the 15-minute window to resolve and **Market settled** to appear. Open the settled position/result. | A `MarketSettled` Stream event for that exact market and Gemini official outcome. |
| 2:32–2:45 | Navigate to Pool. Frame LP balance, queue owed, fees and $WICKED staking/emissions. End on the devnet safety footer. | Stream-backed pool projection and “Devnet demo. Test USDC only. Not a real-money product.” |

The automated recorder performs the same sequence: weekly ladder → demo wallet → faucet → trade → 1000x clamp → open at cap → real Stream event → liquidation → settlement → pool. The bot seeding window may run before capture; it must not be presented as organic user volume.

## Burn-in captions

`scripts/record-demo.ts` holds each real browser shot until its reference boundary when the evidence arrives early, extracts the text from this block, replaces cue boundaries with the observed transition time, and burns those captions without changing playback speed. Late evidence shifts its own boundary truthfully; the raw capture must still be 150–180 seconds with eight ordered transitions or the recorder fails.

```srt
1
00:00:00,000 --> 00:00:18,000
Wick quotes every Gemini BTC strike at an options-implied fair value.

2
00:00:18,000 --> 00:00:38,000
The tail ladder reveals thinly traded outcomes and the live per-market risk cap.

3
00:00:38,000 --> 00:01:00,000
One click creates and funds a throwaway wallet with devnet SOL and test USDC only.

4
00:01:00,000 --> 00:01:24,000
A 1000x request is clamped to the binary-gamma risk cap before the YES position opens.

5
00:01:24,000 --> 00:01:48,000
QuickNode Streams pushes the confirmed on-chain position into Wick's live activity feed.

6
00:01:48,000 --> 00:02:12,000
The keeper posts fresh theo marks; unsafe positions liquidate transparently on Solana.

7
00:02:12,000 --> 00:02:32,000
Gemini's official resolution settles the market — Wick never invents its own outcome.

8
00:02:32,000 --> 00:02:45,000
Trader losses bootstrap the pool, while fees and surplus accrue to $WICKED stakers.
```

## Post-record verification

Before upload:

1. Play the MP4 from beginning to end with audio muted and confirm captions are legible at 1080p-equivalent resolution.
2. Confirm the duration is between 150 and 180 seconds and the file is `demo/wick-demo.mp4`.
3. Confirm no seed phrases, keypair material, provider tokens, webhook secrets, browser devtools, or personal notifications are visible.
4. Check each transaction/explorer link is devnet, each feed event is real, and the displayed program ID matches the verified README row.
5. Upload to an accessible host, test the link in a signed-out browser, then add it to `docs/HANDOFF.md` and Devpost.
