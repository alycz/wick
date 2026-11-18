import type { ChartPoint } from "@/components/wick-chart";

/* Simulated protocol stats and leaderboard for visitors on the demo account or when no backend is reachable.
   The backend has no endpoints for these yet. Values are deterministic per hour, so they hold still while a page
   is open and move forward over time. */

const hash = (n: number) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const HOUR = 3600;

export type Period = "24h" | "7d" | "30d" | "all";
export type RankBy = "pnl" | "volume";

const SCALE: Record<Period, number> = { "24h": .12, "7d": 1, "30d": 3.6, all: 9 };
const SEED: Record<Period, number> = { "24h": 11, "7d": 22, "30d": 33, all: 44 };
const MARKETS = ["BTC > $92k daily", "BTC Up/Down 15m", "BTC > $95k weekly", "BTC > $90k hourly", "BTC > $100k monthly"];
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export interface LeaderRow { id: number; trader: string; pnl: number; volume: number; roi: number; winRate: number; trades: number; market: string; hue: number }

function trader(i: number) {
  const pick = (n: number, offset: number) => Array.from({ length: n }, (_, j) => ALPHABET[Math.floor(hash(i * 31 + j + offset) * ALPHABET.length)]).join("");
  return `${pick(4, 7)}…${pick(4, 91)}`;
}

export function leaderboard(period: Period, by: RankBy, now = Date.now()): LeaderRow[] {
  const f = SCALE[period], seed = SEED[period] + Math.floor(now / 3600e3) % 7 * .001;
  const rows = Array.from({ length: 30 }, (_, i) => {
    const volume = Math.round((4000 + hash(i * 7 + seed) * 180_000) * f);
    const pnl = Math.round((hash(i * 13 + seed) * .34 - .06) * volume * 100) / 100;
    return { id: i, trader: trader(i), volume, pnl, roi: pnl / Math.max(200, volume * .08) * 100, winRate: 38 + hash(i * 19 + seed) * 34,
      trades: Math.max(3, Math.round((20 + hash(i * 17 + seed) * 340) * f)), market: MARKETS[Math.floor(hash(i * 23 + seed) * MARKETS.length)]!, hue: Math.floor(hash(i + 5) * 360) };
  });
  return rows.sort((a, b) => by === "pnl" ? b.pnl - a.pnl : b.volume - a.volume);
}

export function myRank(period: Period) {
  const f = SCALE[period];
  return { rank: { "24h": 212, "7d": 128, "30d": 96, all: 141 }[period], pnl: 105.67 * f, volume: Math.round(12_480 * f), winRate: 58 };
}

/* hourly series for the last 30 days, a random walk with drift */
function walk(seed: number, start: number, drift: number, step: number, now: number, floor = 0): ChartPoint[] {
  const end = Math.floor(now / 1000 / HOUR) * HOUR;
  const out: ChartPoint[] = [];
  let value = start;
  for (let i = 0; i < 720; i++) {
    value = Math.max(floor, value + (hash(i + seed) - .5 + drift) * step);
    out.push({ time: end - (719 - i) * HOUR, value });
  }
  return out;
}

export function protocolStats(now = Date.now()) {
  const oiYes = walk(1201, 90_000, .012, 2600, now);
  const oiNo = walk(1301, 70_000, .01, 2400, now);
  const volume = walk(1401, 1.2e6, .5, 9000, now);
  const traderPnl = walk(1501, 0, -.06, 900, now, -1e9);
  const dayAgo = (series: ChartPoint[]) => series[series.length - 25]!.value;
  const last = (series: ChartPoint[]) => series[series.length - 1]!.value;
  return {
    oiYes, oiNo, volume, traderPnl,
    openInterest: last(oiYes) + last(oiNo),
    volume24h: last(volume) - dayAgo(volume),
    totalVolume: last(volume),
    trades: 41_906 + Math.floor(now / 3600e3) % 500,
    traders: 2318 + Math.floor(now / 86_400e3) % 40,
  };
}

export function exposure(labels: string[]) {
  return labels.map((label, i) => ({ label, yes: 8000 + hash(i + 71) * 42_000, no: 6000 + hash(i + 83) * 36_000 }));
}

export function liquidations(now = Date.now()) {
  const rows: Array<[string, string, "y" | "n", number]> = [["BTC > $93k daily", "NO 8x", "n", 50], ["BTC Up/Down 15m", "UP 20x", "y", 18.4], ["BTC > $91.5k hourly", "YES 30x", "y", 212],
    ["BTC > $95k weekly", "NO 12x", "n", 74.2], ["BTC > $90k daily", "YES 25x", "y", 31.75], ["BTC Up/Down 15m", "DOWN 10x", "n", 22.1]];
  return rows.map(([market, side, tone, margin], i) => ({ time: now - (i * 17 + 4) * 60e3, market, side, tone, margin }));
}
