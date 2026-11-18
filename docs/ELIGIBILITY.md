# UBC 2026 eligibility checklist

This is an evidence checklist, not a prize or acceptance claim. Verified on November 18, 2026:

- the source repository is public at [github.com/alycz/wick](https://github.com/alycz/wick), with `main` at `80977a098caffb62d466a94eea7c8a31edde1563` and CI run [44279482766](https://github.com/alycz/wick/actions/runs/44279482766) passing;
- the Next.js frontend is publicly reachable at [wick-markets-phi.vercel.app](https://wick-markets-phi.vercel.app/);
- the Railway backend is reachable at [wick-backend-production-1e2c4649.up.railway.app](https://wick-backend-production-1e2c4649.up.railway.app/health) and reports Solana devnet, healthy live volatility data and `chainConfigured: true`;
- program [`GY2WTMTTpSh3xBaf1HYGP5PDic5vjA5wucJdTci92GL8`](https://explorer.solana.com/address/GY2WTMTTpSh3xBaf1HYGP5PDic5vjA5wucJdTci92GL8?cluster=devnet) is executable on devnet, with example confirmed [market creation](https://explorer.solana.com/tx/5DeJQYoUN83WjBd9Lg1itMMdwctdZixyvYfuAo8BepgDaKyznSjs5Qhbm81o7TGiSUa4QYas6RZ178ZzyPSbhcf2?cluster=devnet) and [settlement](https://explorer.solana.com/tx/5DZcdtZrXJVncS5e6eASRoid1xqMXMg7GujHeztBdgVsp7RMBYiUjaaqDVny7CzkCTPehv4KqacLWWVW9M2dSLaW?cluster=devnet);
- the six-decimal test-USDC mint is live with a fixed 200,000-token supply and revoked mint/freeze authorities.

The public browser trade/faucet lifecycle, active QuickNode Stream delivery, and final demo video remain unverified. Signed-out Portfolio, Pool, Leaderboard and Stats examples are explicitly labelled local simulations and are not chain or sponsor evidence.

Official references:

- [UBC Hackathon program and tracks](https://www.universityblockchain.org/programs/hackathon)
- [UBC Hackathon 2026 official rules](https://ubc-hackathon-2026.devpost.com/rules)
- [Devpost submission page](https://ubc-hackathon-2026.devpost.com/)

## QuickNode Streams bounty

- [ ] **Core data source:** a live QuickNode Stream, not the 60-second reconciliation poll, supplies program events that power the activity feed, positions, leaderboard and LP history.
- [ ] **Configured Stream:** active on `solana-devnet`, dataset `block`, starting at the chain tip; Stream ID and terminal active status are recorded.
- [ ] **Verified filter:** the deployed Wick program ID replaces the placeholder; failed transactions are skipped; top-level and inner instructions are inspected; transaction signature, slot, block time and logs are retained. A real program transaction matches through QuickNode's test endpoint.
- [ ] **Destination:** the authenticated Railway webhook receives a real Stream delivery, and the same transaction appears in `/feed` at measured low latency.
- [x] **Repository documentation:** the README explains the intended network, dataset, filter, destination and role, while keeping live wording conditional.

The backend currently reports `indexerConfigured: false` and `streamEvidencePresent: false`; its unauthenticated webhook returns `503 STREAMS_NOT_CONFIGURED`. Do not select the QuickNode bounty until every unchecked box has evidence.

## Track and submission requirements

- [x] **Public source:** repository, setup instructions, technical documentation and architecture overview are available.
- [x] **Solana deployment:** the Wick Anchor program and test assets are deployed on devnet, with addresses and explorer links recorded in the README.
- [x] **Gemini Prediction Markets:** the code and running backend use Gemini's public events, strikes, quotes and official outcomes.
- [ ] **Track 02 working-demo acceptance:** the public interface and chain-enabled backend exist, but a fresh browser wallet/faucet/open-position lifecycle has not been verified end to end.
- [ ] **Accessible 2–3 minute demo video:** no final MP4 or public video link has been verified.
- [x] **Submission answers:** copy covers what was built, the problem, operation, differentiation, next steps and current limitations.
- [ ] **Team/account-holder review and Devpost submission:** no form has been submitted by this repository update.
- [ ] **Submit by Friday, November 20, 2026 at 12:00 PM CST.**
- [ ] **In-person availability:** official rules require finalists to present in Austin on Saturday, November 21 to qualify for prizes.

## Final evidence still required

1. Verify a fresh public-browser devnet wallet flow without relying on signed-out example data.
2. Confirm faucet funding, one opened position and the resulting on-chain account state, or explicitly demonstrate the current fail-closed boundary.
3. Configure and verify QuickNode only if entering that optional bounty.
4. Record, review and publish the 2–3 minute video described in [DEMO.md](DEMO.md).
5. Enter the final links and submit through the authorized Devpost account holder.
