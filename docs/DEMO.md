# Wick demo runbook, storyboard and captions

## Current status

No demo MP4 exists. Wick has no verified public deployment, so generating footage now would misrepresent a local/read-only interface as a working product. `scripts/record-demo.ts` is deliberately fail-closed: it runs real devnet bots and `demo-check`, records a configured deployment only, waits for real open/liquidation/settlement events, and emits `demo/wick-demo.mp4` only after Playwright and ffmpeg succeed.

Target runtime is **2:45 (165 seconds)**, inside the required 2–3 minute window. Every shot below must use the final public deployment and real devnet/test assets. Do not splice in fixture data, edit browser state, or seed fake feed entries.

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

Expected final duration is `165` seconds. The recorder itself runs the real bots and `demo-check` again before opening Chromium. If any prerequisite, transaction, alert, live cap, liquidation, settlement, video, caption or encoding step fails, stop and fix the system; do not make an alternate simulated video.

## Exact storyboard

| Time | Shot and action | Evidence visible |
|---:|---|---|
| 0:00–0:18 | Open the deployed markets page on the current BTC 15-minute hero. Frame spot, strike, countdown, Wick theo, Gemini bid/ask, edge and live cap. | Production HTTPS URL; current contract; live values rather than placeholders. |
| 0:18–0:38 | Switch Tail ladder to Weekly and scan strikes from near money into a thin tail. Pause on missing/one-sided Gemini liquidity beside Wick theo. | Multiple real Gemini strikes, tails, vol-source badge and per-row cap. |
| 0:38–1:00 | Click **Try it now**, show the “Demo wallet, devnet only” banner, then request the faucet grant. | Fresh browser-local address and one confirmed grant of 0.05 devnet SOL + 1,000 test USDC. Never expose authority keys. |
| 1:00–1:24 | Enter the live 15-minute trade screen. Drag leverage toward 1000x so the UI clamps it to the live cap; review entry, contracts, max payout and liquidation distance; open YES at the cap. | Cap enforcement in UI and a confirmed real Wick program transaction. |
| 1:24–1:48 | Keep the right activity rail visible until **Position opened** appears. Show the transaction link/feed item. | The same real transaction delivered by the verified QuickNode Stream, with observed latency near two seconds. |
| 1:48–2:12 | Let bot/live activity continue until **Liquidation** appears; briefly show current mark/cap and portfolio status. | Confirmed on-chain liquidation, not a scripted DOM injection. |
| 2:12–2:32 | Wait for the 15-minute window to resolve and **Market settled** to appear. Open the settled position/result. | Gemini official outcome and corresponding Wick settlement event. |
| 2:32–2:45 | Navigate to Pool. Frame LP balance, queue owed, fees and $WICKED staking/emissions. End on the devnet safety footer. | Stream-backed pool projection and “Devnet demo. Test USDC only. Not a real-money product.” |

The automated recorder performs the same sequence: weekly ladder → demo wallet → faucet → trade → 1000x clamp → open at cap → real Stream event → liquidation → settlement → pool. The bot seeding window may run before capture; it must not be presented as organic user volume.

## Burn-in captions

`scripts/record-demo.ts` extracts this block, stretches the truthful raw capture to exactly 165 seconds, and burns the captions with ffmpeg.

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
