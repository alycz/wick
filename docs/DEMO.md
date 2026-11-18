# Wick 2–3 minute demo runbook

## Current recording boundary

Verified November 18, 2026:

- frontend: [wick-markets-phi.vercel.app](https://wick-markets-phi.vercel.app/), HTTP 200;
- backend: [Railway health](https://wick-backend-production-1e2c4649.up.railway.app/health), Solana devnet, healthy live volatility and `chainConfigured: true`;
- program: [`GY2WTMTTpSh3xBaf1HYGP5PDic5vjA5wucJdTci92GL8`](https://explorer.solana.com/address/GY2WTMTTpSh3xBaf1HYGP5PDic5vjA5wucJdTci92GL8?cluster=devnet), executable with confirmed market-create/settle activity;
- test-USDC mint: [`HLb5ovT6hS5TP5CYhTqZgoHnPh93bCzU5tthZcYWmAgU`](https://explorer.solana.com/address/HLb5ovT6hS5TP5CYhTqZgoHnPh93bCzU5tthZcYWmAgU?cluster=devnet), fixed 200,000 supply with revoked authorities.

Not verified: a fresh public-browser faucet/open-position lifecycle, QuickNode Stream delivery, or a public final-video link. Backend health currently reports `indexerConfigured: false` and `streamEvidencePresent: false`. Do not say “live via QuickNode,” show local receipts as signatures, or imply signed-out example totals are protocol state.

Signed-out verification after build `d2909723e595b2519f86595e52029f3e9991383b` confirmed Landing, Markets, Portfolio, Pool and Stats render. Markets showed a populated Wick price chart, strike table, trade ticket and Wick fair price. No Gemini bid/ask was visible. Treat the chart's **Live** selector only as the displayed chart/range control; it is not evidence of live protocol state, QuickNode delivery or a connected wallet. Signed-out Portfolio, Pool and Stats screens intentionally show **Example demo · simulated locally** previews.

## Recording choices

Use the honest product-tour storyboard below now. It demonstrates the deployed product, live market/backend inputs, explicit simulation boundary and verified devnet deployment without inventing a successful browser transaction.

A silent, captioned, 2:45 local WebM review cut was rendered from public signed-out pages and public devnet explorer evidence. It contains no login, personal content or submitted trade. It has not been uploaded or accepted as the final submission video and must be watched end to end before any upload.

Use `scripts/record-demo.ts` only after the full chain + QuickNode gate passes. That automated recorder deliberately requires correlated on-chain and Stream events and must not be weakened to manufacture a success.

## Pre-record checks

1. Open every planned URL in a signed-out browser and confirm no personal notifications, extensions or account data are visible.
2. Confirm frontend HTTP 200 and backend `/health` shows devnet, healthy volatility and `chainConfigured: true`.
3. Confirm the program explorer is on `cluster=devnet` and the program account remains executable.
4. Confirm Portfolio, Pool and Stats still carry the simulation disclosure when signed out.
5. Record at 1920×1080 or a 16:9 equivalent. Target `150–170` seconds.

## Storyboard: verified product tour (2:45)

| Time | Shot and action | Narration / evidence boundary |
|---:|---|---|
| 0:00–0:20 | Open the public landing page. Frame the Wick mark, headline and compact navigation. | “Wick presents BTC contract pricing in a Solana devnet product demo. This demonstration uses test assets only.” |
| 0:20–0:55 | Select **Markets**. Show the populated BTC price chart, current contract context, Wick fair price, strike table and trade ticket. Move through the table without submitting a trade. | Do not claim Gemini bid/ask is visible. If the **Live** selector appears, describe it only as the chart's selected display range—not protocol, wallet or Stream evidence. |
| 0:55–1:20 | Open **Portfolio** while signed out. Hold on the **Example demo · simulated locally** disclosure and example positions. | Say that the screen demonstrates the UX only: the receipts, returns and claims are not wallet balances, Solana transactions, Gemini outcomes or QuickNode events. |
| 1:20–1:50 | Open **Pool** and show the liquidity chart, payout-queue explanation and example disclosure. | Explain the self-bootstrapping pool and FIFO claims. Do not present example liquidity or the chart's **Live** selector as on-chain state or claimable funds. |
| 1:50–2:15 | Open **Stats** and keep the simulation banner visible while showing the dashboard structure. | Explain that signed-out totals, PnL, exposure and charts are illustrative; connected users must receive only indexed genuine data. |
| 2:15–2:35 | Show the devnet program explorer and the README address row. | State the exact deployed program ID, devnet only, plus fixed-supply test USDC. This is real chain evidence, independent of the guest examples. |
| 2:35–2:45 | Return to the landing page. | Narrate, rather than claiming visible footer text: “Wick is deployed on devnet with test assets. QuickNode delivery and the public browser transaction lifecycle remain open verification items.” |

## Suggested captions

```srt
1
00:00:00,000 --> 00:00:20,000
Wick presents BTC contract pricing in a Solana devnet product demo.

2
00:00:20,000 --> 00:00:55,000
Markets shows Wick fair value and strikes; Live is a chart control, not protocol evidence.

3
00:00:55,000 --> 00:01:20,000
Signed-out portfolio examples are simulated locally—not wallet, chain or provider evidence.

4
00:01:20,000 --> 00:01:50,000
The pool retains trading losses and queues profitable payouts when liquidity is short.

5
00:01:50,000 --> 00:02:15,000
Signed-out protocol statistics remain clearly labelled illustrative previews.

6
00:02:15,000 --> 00:02:35,000
The Wick Anchor program and fixed-supply test USDC are deployed on Solana devnet.

7
00:02:35,000 --> 00:02:45,000
Devnet is real; QuickNode delivery and the public browser transaction lifecycle remain unverified.
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
2. Confirm runtime is 120–180 seconds; the target storyboard and local review cut are 165 seconds.
3. Confirm no seed phrase, keypair, provider token, webhook secret, private browser data or personal notification appears.
4. Check that every explorer URL uses `cluster=devnet`.
5. If the video shows a transaction, verify the full signature and relevant Wick accounts independently; otherwise do not imply a transaction occurred.
6. If the video says QuickNode is active, require the Stream ID, active provider status, authenticated delivery and matching `/feed` event first. The current state does not meet this condition.
7. Upload to YouTube or Google Drive, test the link signed out, then add the final URL to `docs/DEVPOST.md`. No upload or Devpost submission is performed by this runbook update.
