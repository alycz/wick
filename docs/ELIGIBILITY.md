# UBC 2026 eligibility checklist

This checklist is evidence, not an eligibility or prize claim. Verified November 20: the public frontend and backend are reachable; program [`GY2WTMTTpSh3xBaf1HYGP5PDic5vjA5wucJdTci92GL8`](https://explorer.solana.com/address/GY2WTMTTpSh3xBaf1HYGP5PDic5vjA5wucJdTci92GL8?cluster=devnet) is executable on Solana devnet; and finalized [transaction `2dyg…FvT`](https://explorer.solana.com/tx/2dygCmL5yYEdDuwVrCgreeMrHc3Jzfnz778rbqEGjYejYzpecarKVkWoXsxR1CquSA4omzNZVWWW4GHPVqkxdFvT?cluster=devnet) settled Gemini event `BTC05M2611201520` as **No** at its official value `60258.3`. The public browser faucet/open-position path remains unverified.

Official references:

- [UBC Hackathon program and tracks](https://www.universityblockchain.org/programs/hackathon)
- [UBC Hackathon 2026 official rules](https://ubc-hackathon-2026.devpost.com/rules)
- [Devpost submission page](https://ubc-hackathon-2026.devpost.com/)

## QuickNode Streams bounty

- [ ] **Core data source:** a live QuickNode Stream, not the 60-second reconciliation poll, supplies program events that power the activity feed, positions, leaderboard, and LP history.
- [ ] **Configured Stream:** active on `solana-devnet`, dataset `block`, starting at the chain tip; Stream ID and terminal active status are recorded.
- [ ] **Verified filter:** the deployed Wick program ID replaces the placeholder; failed transactions are skipped; top-level and inner instructions are inspected; transaction signature, slot, block time, and logs are retained. A real program transaction matches via QuickNode's test endpoint.
- [ ] **Destination:** an authenticated public HTTPS Railway endpoint receives the Stream and a real trade appears in `/feed` in roughly two seconds.
- [x] **Repository documentation:** the README explains the intended network, dataset, filter, destination, and role. Its live wording must remain conditional until the preceding four checks pass.

The deployed backend currently reports `indexerConfigured: false` and `streamEvidencePresent: false`. Public feed entries carry `provenance: "rpc_reconcile"`. Wick must not claim the QuickNode bounty unless every box is checked with a Stream ID, public destination, real transaction signature/block, and observed Stream-provenance event.

## Track and sponsor requirements

- [x] Track 02 DeFi & Onchain Apps: Wick's custom program is deployed and finalized market-settlement evidence is linked; do not claim the unverified browser transaction path.
- [x] Solana award: core logic is deployed via Anchor on Solana devnet; README records the program and deployed account addresses.
- [x] Gemini Prediction Markets: a finalized Wick market settlement matches Gemini's official `resolutionSide` and settlement value; the evidence does not attribute submission to the automated keeper process.
- [x] Public source repository with setup instructions, technical documentation, and architecture overview.
- [ ] Working public deployed demo.
- [ ] Accessible 2–3 minute demo video.
- [x] Submission answers cover what was built, the problem, how it works, differentiation, and next steps; final deployment evidence and account-holder review remain pending.
- [ ] Submit by Friday, November 20, 2026 at 12:00 PM CST. The internal deployment/verification cutoff is Thursday, November 19 at 11:59 PM CST.
- [ ] Finalists can present in person in Austin on Saturday, November 21. The official rules require in-person presence to qualify for prizes.

