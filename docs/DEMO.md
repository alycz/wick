# Wick demo runbook and captions

`scripts/record-demo.ts` first runs the real devnet bots, then `demo-check`, and stops if any required system is unconfigured. It records only a verified deployed app; a local mock or fabricated activity feed is never accepted.

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
