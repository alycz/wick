import type { DemoClaim, DemoPosition } from "./ledger";

/*
 * Deterministic, non-persistent examples for signed-out visitors. These objects are
 * presentation fixtures, not chain/indexer/provider records. Keep their identifiers
 * unmistakably local and never expose them through the real-data API path.
 */

export type GuestPortfolioPosition = DemoPosition & {
  previewOnly: true;
  previewLabel: string;
  previewSub: string;
  previewPnlE6?: string;
  previewMark?: number;
};

export type GuestPortfolioClaim = DemoClaim & { previewOnly: true };

export const GUEST_PORTFOLIO_POSITIONS: readonly GuestPortfolioPosition[] = [
  {
    address: "demo-preview-position-open",
    owner: "demo-preview-account",
    market: "demo-preview-btc-above",
    side: "yes",
    marginE6: "250000000",
    leverage: 4,
    entryE6: 570000,
    contractsE6: "1754385964",
    liqMarkE6: 427500,
    status: "open",
    openedTs: 1794952800000,
    previewPnlE6: "61250000",
    previewMark: 0.605,
    previewOnly: true,
    previewLabel: "BTC above example strike",
    previewSub: "Illustrative open position",
    snapshot: { symbol: "demo-preview-btc-above", kind: "ladder", duration: "1d", title: "Example position", strike: 100000, expiryTs: 1795039200000 },
  },
  {
    address: "demo-preview-position-win",
    owner: "demo-preview-account",
    market: "demo-preview-btc-up",
    side: "yes",
    marginE6: "180000000",
    leverage: 3,
    entryE6: 520000,
    contractsE6: "1038461538",
    liqMarkE6: 346667,
    status: "closed",
    openedTs: 1794866400000,
    closedTs: 1794870000000,
    realizedPnlE6: "87500000",
    paidE6: "267500000",
    previewOnly: true,
    previewLabel: "BTC Up example",
    previewSub: "Illustrative closed position",
    snapshot: { symbol: "demo-preview-btc-up", kind: "up_down", duration: "15m", title: "Example position", strike: 98500, expiryTs: 1794870000000 },
  },
  {
    address: "demo-preview-position-loss",
    owner: "demo-preview-account",
    market: "demo-preview-btc-no",
    side: "no",
    marginE6: "120000000",
    leverage: 2,
    entryE6: 610000,
    contractsE6: "393442622",
    liqMarkE6: 305000,
    status: "closed",
    openedTs: 1794780000000,
    closedTs: 1794783600000,
    realizedPnlE6: "-42000000",
    paidE6: "78000000",
    previewOnly: true,
    previewLabel: "BTC below example strike",
    previewSub: "Illustrative closed position",
    snapshot: { symbol: "demo-preview-btc-no", kind: "ladder", duration: "1h", title: "Example position", strike: 97500, expiryTs: 1794783600000 },
  },
];

export const GUEST_PORTFOLIO_CLAIMS: readonly GuestPortfolioClaim[] = [
  {
    address: "demo-preview-claim-1",
    claimIndex: "example-1",
    owner: "demo-preview-account",
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

export const GUEST_POOL_HISTORY: readonly GuestPoolPoint[] = [
  { blockTime: 1794787200, balanceE6: "38400000000", queueOwedE6: "2100000000", feesE6: "3220000000", signature: "demo-receipt-pool-snapshot-1" },
  { blockTime: 1794830400, balanceE6: "40250000000", queueOwedE6: "1650000000", feesE6: "3610000000", signature: "demo-receipt-pool-snapshot-2" },
  { blockTime: 1794873600, balanceE6: "39780000000", queueOwedE6: "1280000000", feesE6: "3980000000", signature: "demo-receipt-pool-snapshot-3" },
  { blockTime: 1794916800, balanceE6: "42140000000", queueOwedE6: "980000000", feesE6: "4360000000", signature: "demo-receipt-pool-snapshot-4" },
  { blockTime: 1794960000, balanceE6: "43820000000", queueOwedE6: "760000000", feesE6: "4730000000", signature: "demo-receipt-pool-snapshot-5" },
];

export const GUEST_POOL_ACTIVITY = [
  { id: "demo-receipt-pool-1", name: "Example pool update", detail: "+$1,680 simulated" },
  { id: "demo-receipt-pool-2", name: "Example payout", detail: "$220 simulated" },
  { id: "demo-receipt-pool-3", name: "Example liquidation", detail: "$410 simulated" },
] as const;

export const GUEST_LEADERBOARD = [
  { rank: 1, trader: "Example trader A", pnl: 8_420, volume: 48_300, roi: 34.2, winRate: 71, trades: 24, market: "BTC 15m" },
  { rank: 2, trader: "Example trader B", pnl: 6_180, volume: 39_850, roi: 28.7, winRate: 66, trades: 31, market: "BTC daily" },
  { rank: 3, trader: "Example trader C", pnl: 4_760, volume: 27_400, roi: 22.1, winRate: 63, trades: 19, market: "BTC hourly" },
  { rank: 4, trader: "Example trader D", pnl: 2_940, volume: 21_650, roi: 17.4, winRate: 59, trades: 17, market: "BTC weekly" },
] as const;

export const GUEST_STATS = {
  openMarkets: 18,
  openInterest: 184_320,
  volume24h: 92_460,
  traderPnl: 12_880,
  exposure: [
    { expiry: "15 minute", yes: 31_400, no: 28_900 },
    { expiry: "Hourly", yes: 46_800, no: 39_200 },
    { expiry: "Daily+", yes: 22_600, no: 15_420 },
  ],
  liquidations: [
    { id: "demo-receipt-liquidation-1", label: "Example liquidation", amount: 420 },
    { id: "demo-receipt-liquidation-2", label: "Example liquidation", amount: 285 },
  ],
} as const;
