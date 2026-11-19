import type { DemoClaim, DemoPosition } from "./ledger";

/*
 * Signed-out preview data. These objects are presentation fixtures for the guest view, never chain, indexer or
 * provider records, and they never go through the real-data API path. Identifiers start with "preview-" so the
 * app can tell them apart from ledger and chain records; what a visitor reads is written like a live account.
 */

export type GuestPortfolioPosition = DemoPosition & {
  previewOnly: true;
  previewLabel: string;
  previewSub: string;
  previewPnlE6?: string;
  previewMark?: number;
};

export type GuestPortfolioClaim = DemoClaim & { previewOnly: true };

const HOUR = 3_600;
/* the preview follows the clock, so its charts and times always end now */
const NOW_S = Math.floor(Date.now() / 1000 / 60) * 60;
const NOW_MS = NOW_S * 1000;

/* small deterministic generator, so every visitor sees the same shapes */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state * 1_664_525 + 1_013_904_223) >>> 0; return state / 4_294_967_296; };
}

/** an hourly series that wanders and ends exactly at `end` */
function walk(seed: number, points: number, end: number, drift: number, noise: number, floor = -Infinity) {
  const rand = seeded(seed);
  const raw: number[] = [0];
  for (let i = 1; i < points; i += 1) raw.push(raw[i - 1]! + drift + (rand() - .5) * noise + (rand() < .05 ? (rand() - .35) * noise * 4 : 0));
  const shift = end - raw[raw.length - 1]!;
  return raw.map((value, index) => ({ time: NOW_S - (points - 1 - index) * HOUR, value: Math.max(floor, value + shift) }));
}

export const GUEST_PORTFOLIO_POSITIONS: readonly GuestPortfolioPosition[] = [
  {
    address: "preview-position-open",
    owner: "preview-account",
    market: "preview-btc-above-64000",
    side: "yes",
    marginE6: "250000000",
    leverage: 4,
    entryE6: 470000,
    contractsE6: "2127659574",
    liqMarkE6: 352500,
    status: "open",
    openedTs: NOW_MS - 5 * HOUR * 1000,
    previewPnlE6: "61250000",
    previewMark: 0.499,
    previewOnly: true,
    previewLabel: "BTC > $64k",
    previewSub: "Daily",
    snapshot: { symbol: "preview-btc-above-64000", kind: "ladder", duration: "1d", title: "BTC above $64,000", strike: 64_000, expiryTs: NOW_MS + 14 * HOUR * 1000 },
  },
  {
    address: "preview-position-win",
    owner: "preview-account",
    market: "preview-btc-up-15m",
    side: "yes",
    marginE6: "180000000",
    leverage: 3,
    entryE6: 520000,
    contractsE6: "1038461538",
    liqMarkE6: 346667,
    status: "closed",
    openedTs: NOW_MS - 26 * HOUR * 1000,
    closedTs: NOW_MS - 25.75 * HOUR * 1000,
    realizedPnlE6: "87500000",
    paidE6: "267500000",
    previewOnly: true,
    previewLabel: "BTC Up or Down 15m",
    previewSub: "Up from $63,214.50",
    snapshot: { symbol: "preview-btc-up-15m", kind: "up_down", duration: "15m", title: "BTC Up or Down", strike: 63_214.5, expiryTs: NOW_MS - 25.75 * HOUR * 1000 },
  },
  {
    address: "preview-position-loss",
    owner: "preview-account",
    market: "preview-btc-above-63500",
    side: "no",
    marginE6: "120000000",
    leverage: 2,
    entryE6: 610000,
    contractsE6: "393442622",
    liqMarkE6: 305000,
    status: "closed",
    openedTs: NOW_MS - 50 * HOUR * 1000,
    closedTs: NOW_MS - 49 * HOUR * 1000,
    realizedPnlE6: "-42000000",
    paidE6: "78000000",
    previewOnly: true,
    previewLabel: "BTC > $63.5k",
    previewSub: "Hourly · settled",
    snapshot: { symbol: "preview-btc-above-63500", kind: "ladder", duration: "1h", title: "BTC above $63,500", strike: 63_500, expiryTs: NOW_MS - 49 * HOUR * 1000 },
  },
];

export const GUEST_PORTFOLIO_CLAIMS: readonly GuestPortfolioClaim[] = [
  {
    address: "preview-claim-184",
    claimIndex: "184",
    owner: "preview-account",
    amountE6: "120000000",
    paidE6: "35000000",
    status: "queued",
    previewOnly: true,
  },
];

export interface GuestPoolPoint {
  blockTime: number;
  balanceE6: string;
  queueOwedE6: string;
  feesE6: string;
  signature: string;
}

const e6 = (value: number) => String(Math.round(value * 1_000_000));
const poolWalk = walk(11, 24 * 14, 43_820, 22, 260);
const feesWalk = walk(12, 24 * 14, 4_730, 6, 2, 0);
const queueWalk = walk(13, 24 * 14, 760, -3, 60, 0);
export const GUEST_POOL_HISTORY: readonly GuestPoolPoint[] = poolWalk.map((point, index) => ({
  blockTime: point.time,
  balanceE6: e6(point.value),
  queueOwedE6: e6(queueWalk[index]!.value),
  feesE6: e6(Math.max(0, feesWalk[index]!.value)),
  signature: `preview-pool-${index}`,
}));

/* activity reads like the indexed feed: event, transaction, amount, time */
export const GUEST_POOL_ACTIVITY = [
  { id: "preview-pool-1", name: "Liquidation", tx: "4xQm7Rk2…9Kd2Lp", detail: "+$410.00", color: "var(--wick)", ago: 7 },
  { id: "preview-pool-2", name: "Pool updated", tx: "2bVn8Tq1…Hw3eZa", detail: "+$1,680.00", color: "var(--wick)", ago: 22 },
  { id: "preview-pool-3", name: "Payout paid", tx: "5JtL9cXe…mQ4vRs", detail: "−$220.00", color: "var(--no-hi)", ago: 41 },
  { id: "preview-pool-4", name: "Staked", tx: "3sKp2WfN…Yt7uCd", detail: "12,500 $WICKED", color: "var(--muted)", ago: 64 },
  { id: "preview-pool-5", name: "Rewards claimed", tx: "6HgR4mBz…Lc8nKe", detail: "$38.40", color: "var(--yes-hi)", ago: 95 },
].map((event) => ({ ...event, ts: NOW_MS - event.ago * 60_000 }));

export const GUEST_LEADERBOARD = [
  { rank: 1, trader: "kairos.sol", pnl: 8_420, volume: 48_300, roi: 34.2, winRate: 71, trades: 24, market: "BTC 15m" },
  { rank: 2, trader: "7Hq2…mV4e", pnl: 6_180, volume: 39_850, roi: 28.7, winRate: 66, trades: 31, market: "BTC daily" },
  { rank: 3, trader: "thetagang.sol", pnl: 4_760, volume: 27_400, roi: 22.1, winRate: 63, trades: 19, market: "BTC hourly" },
  { rank: 4, trader: "Fz9p…3kLw", pnl: 2_940, volume: 21_650, roi: 17.4, winRate: 59, trades: 17, market: "BTC weekly" },
  { rank: 5, trader: "lowvol.sol", pnl: 2_310, volume: 33_120, roi: 9.8, winRate: 57, trades: 42, market: "BTC 5m" },
  { rank: 6, trader: "9mDe…Qa7c", pnl: 2_085, volume: 12_480, roi: 21.6, winRate: 61, trades: 13, market: "BTC hourly" },
  { rank: 7, trader: "sats4days.sol", pnl: 1_960, volume: 18_740, roi: 13.2, winRate: 55, trades: 26, market: "BTC 15m" },
  { rank: 8, trader: "You", pnl: 1_840, volume: 14_920, roi: 12.3, winRate: 58, trades: 19, market: "BTC daily", mine: true },
  { rank: 9, trader: "B4tc…uY2n", pnl: 1_515, volume: 9_860, roi: 15.4, winRate: 54, trades: 11, market: "BTC month-end" },
  { rank: 10, trader: "wickhunter.sol", pnl: 1_270, volume: 22_300, roi: 5.7, winRate: 52, trades: 37, market: "BTC 5m" },
] as const;

export const GUEST_STATS = {
  openMarkets: 18,
  openInterest: 184_320,
  volume24h: 92_460,
  traderPnl: 12_880,
  yesShare: .54,
  /* hourly over two weeks, each ending at the headline figure */
  openInterestSeries: walk(21, 24 * 14, 184_320, 330, 2_400, 20_000),
  volumeSeries: walk(22, 24 * 14, 92_460, 40, 5_200, 18_000),
  traderPnlSeries: walk(23, 24 * 14, 12_880, 30, 900),
  exposure: [
    { expiry: "15 minute", yes: 31_400, no: 28_900 },
    { expiry: "Hourly", yes: 46_800, no: 39_200 },
    { expiry: "Daily", yes: 14_200, no: 9_620 },
    { expiry: "Weekly+", yes: 8_400, no: 5_800 },
  ],
  liquidations: [
    { id: "preview-liq-1", market: "BTC > $63.75k · Hourly", side: "yes", leverage: 12, trader: "7Hq2…mV4e", amount: 420, ago: 9 },
    { id: "preview-liq-2", market: "BTC Up or Down 15m", side: "no", leverage: 1, trader: "lowvol.sol", amount: 285, ago: 26 },
    { id: "preview-liq-3", market: "BTC > $64k · Daily", side: "yes", leverage: 16, trader: "Fz9p…3kLw", amount: 610, ago: 58 },
    { id: "preview-liq-4", market: "BTC > $63.25k · Hourly", side: "no", leverage: 9, trader: "B4tc…uY2n", amount: 175, ago: 83 },
  ].map((event) => ({ ...event, ts: NOW_MS - event.ago * 60_000 })),
} as const;
