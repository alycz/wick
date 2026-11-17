# UBC 2026 eligibility checklist

This checklist is conditional deployment evidence, not an eligibility claim. As of November 17, Wick has no public deployment, executable devnet program, QuickNode Stream, or public demo URL, so the live-data and working-demo items are incomplete.

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

Wick must not claim the QuickNode bounty until every box is checked with a Stream ID, public destination, real transaction signature/block, and observed feed event.

## Track and sponsor requirements

- [ ] Track 02 DeFi & Onchain Apps: public deployed demo interacts with Wick's smart contract; README documents the economic design and risk assumptions.
- [ ] Solana award: core logic is deployed via Anchor on Solana devnet; README records every program address and explorer link.
- [x] Gemini Prediction Markets: code uses Gemini's public prediction-market events, strike, settlement, and quote APIs; a deployed working integration remains pending.
- [ ] Public source repository with setup instructions, technical documentation, and architecture overview.
- [ ] Working public deployed demo.
- [ ] Accessible 2–3 minute demo video.
- [ ] Submission answers cover what was built, the problem, how it works, differentiation, and next steps.
- [ ] Submit by Friday, November 20, 2026 at 12:00 PM CST. The internal deployment/verification cutoff is Thursday, November 19 at 11:59 PM CST.
- [ ] Finalists can present in person in Austin on Saturday, November 21. The official rules require in-person presence to qualify for prizes.

