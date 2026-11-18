# Wick 2–3 minute demo runbook

## Current recording boundary

Verified November 18, 2026:

- frontend: [wick-markets-phi.vercel.app](https://wick-markets-phi.vercel.app/), HTTP 200;
- backend: [Railway health](https://wick-backend-production-1e2c4649.up.railway.app/health), Solana devnet, healthy live volatility and `chainConfigured: true`;
- program: [`GY2WTMTTpSh3xBaf1HYGP5PDic5vjA5wucJdTci92GL8`](https://explorer.solana.com/address/GY2WTMTTpSh3xBaf1HYGP5PDic5vjA5wucJdTci92GL8?cluster=devnet), executable with confirmed market-create/settle activity;
- test-USDC mint: [`HLb5ovT6hS5TP5CYhTqZgoHnPh93bCzU5tthZcYWmAgU`](https://explorer.solana.com/address/HLb5ovT6hS5TP5CYhTqZgoHnPh93bCzU5tthZcYWmAgU?cluster=devnet), fixed 200,000 supply with revoked authorities.

Not verified: a fresh public-browser faucet/open-position lifecycle, QuickNode Stream delivery, or a final video file. Backend health currently reports `indexerConfigured: false` and `streamEvidencePresent: false`. Do not say “live via QuickNode,” show local receipts as signatures, or imply signed-out example totals are protocol state.

The current navigation is **Markets**, **Portfolio**, **Pool**, **Leaderboard** and **Stats**. Signed-out Portfolio, Pool, Leaderboard and Stats screens intentionally show **Example demo · simulated locally** previews. The wallet menu calls the browser practice path **Demo account** and states **simulated USDC · no network transfer**.

## Recording choices

Use the honest product-tour storyboard below now. It demonstrates the deployed product, live market/backend inputs, explicit simulation boundary and verified devnet deployment without inventing a successful browser transaction.

Use `scripts/record-demo.ts` only after the full chain + QuickNode gate passes. That automated recorder deliberately requires correlated on-chain and Stream events and must not be weakened to manufacture a success.

## Pre-record checks

1. Open every planned URL in a signed-out browser and confirm no personal notifications, extensions or account data are visible.
2. Confirm frontend HTTP 200 and backend `/health` shows devnet, healthy volatility and `chainConfigured: true`.
3. Confirm the program explorer is on `cluster=devnet` and the program account remains executable.
4. Confirm Portfolio, Pool, Leaderboard and Stats still carry the simulation disclosure when signed out.
5. Record at 1920×1080 or a 16:9 equivalent. Target `150–170` seconds.

## Storyboard: verified product tour (2:35)

| Time | Shot and action | Narration / evidence boundary |
|---:|---|---|
| 0:00–0:18 | Open the public landing page. Frame the Wick mark, headline and compact navigation. | “Wick prices Gemini BTC prediction markets from the options surface and caps leverage by binary risk. It is an unaudited Solana devnet demo.” |
| 0:18–0:48 | Select **Markets**. Show the current BTC contract, spot, strike, expiry, Wick theo, Gemini bid/ask and leverage cap. Move through the strike ladder without submitting a trade. | Values come from the running Gemini/volatility backend. Do not call a placeholder or unavailable value live. |
| 0:48–1:10 | Open the wallet menu. Frame the **Demo account** copy and the explicit “simulated USDC · no network transfer” footer; do not create or fund a wallet unless separately verified immediately before recording. | Explain the separation between browser practice and genuine Solana wallet paths. Never expose a seed or key. |
| 1:10–1:32 | Open **Portfolio** while signed out. Hold on the **Example demo · simulated locally** disclosure and example positions. | Say that the screen demonstrates the UX only: the receipts, returns and claims are not wallet balances, Solana transactions, Gemini outcomes or QuickNode events. |
| 1:32–1:52 | Open **Pool** and show the liquidity chart, payout-queue explanation and example disclosure. | Explain the self-bootstrapping pool and FIFO claims. Do not present example liquidity as the on-chain vault balance or claimable funds. |
| 1:52–2:10 | Open **Leaderboard**, then **Stats**. Keep each simulation banner visible. | Explain that guest rankings, volume, PnL and charts are illustrative; connected users must receive only indexed genuine data. |
| 2:10–2:27 | Show the devnet program explorer and the README address row. | State the exact deployed program ID, devnet only, plus fixed-supply test USDC. This is real chain evidence, independent of the guest examples. |
| 2:27–2:35 | Return to the landing page and end on the safety copy. | “Frontend, backend and program are deployed. QuickNode delivery and the public browser transaction lifecycle remain open verification items.” |

## Suggested captions

```srt
1
00:00:00,000 --> 00:00:18,000
Wick prices Gemini BTC prediction markets from the options surface on Solana devnet.

2
00:00:18,000 --> 00:00:48,000
Every supported strike gets a theo, Gemini comparison and market-specific risk cap.

3
00:00:48,000 --> 00:01:10,000
Browser practice is visibly separated from genuine Solana wallet actions.

4
00:01:10,000 --> 00:01:32,000
Signed-out portfolio examples are simulated locally—not wallet, chain or provider evidence.

5
00:01:32,000 --> 00:01:52,000
The pool retains trading losses and queues profitable payouts when liquidity is short.

6
00:01:52,000 --> 00:02:10,000
Guest leaderboard and protocol statistics remain clearly labelled illustrative previews.

7
00:02:10,000 --> 00:02:27,000
The Wick Anchor program and fixed-supply test USDC are deployed on Solana devnet.

8
00:02:27,000 --> 00:02:35,000
QuickNode delivery and the public browser transaction lifecycle remain unverified.
```

Adjust cue boundaries to the actual edit; do not speed up footage or leave a caption claiming evidence after the relevant screen has changed.

## Full end-to-end recorder gate

Only after QuickNode and the fresh wallet flow are verified, run:

```bash
pnpm deploy:check --require-ready
pnpm deploy:verify
pnpm demo:check
DEMO_URL="$FRONTEND_URL" DEMO_BOT_MINUTES=2 pnpm demo:record
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 demo/wick-demo.mp4
```

The automated path must correlate the browser-submitted signature, market and position accounts with real devnet RPC and Stream events. If any funding, transaction, filter, delivery, liquidation, settlement, timing, caption or encoding assertion fails, stop. Do not substitute fixtures, guest previews, similarly named events or unrelated signatures.

## Post-record verification

1. Watch the entire video and confirm every spoken/captioned claim matches the visible evidence.
2. Confirm runtime is 120–180 seconds; the target storyboard is 155 seconds.
3. Confirm no seed phrase, keypair, provider token, webhook secret, private browser data or personal notification appears.
4. Check that every explorer URL uses `cluster=devnet`.
5. If the video shows a transaction, verify the full signature and relevant Wick accounts independently; otherwise do not imply a transaction occurred.
6. If the video says QuickNode is active, require the Stream ID, active provider status, authenticated delivery and matching `/feed` event first. The current state does not meet this condition.
7. Upload to YouTube or Google Drive, test the link signed out, then add the final URL to `docs/DEVPOST.md`. No upload or Devpost submission is performed by this runbook update.
