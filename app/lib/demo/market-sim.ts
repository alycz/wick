import type { IndexedEvent, MarketHistoryPoint, PricerMarket } from "@wick/shared";

/* Simulated market data for when no backend is configured (NEXT_PUBLIC_BACKEND_URL unset).
   Every value is a pure function of time, so repeated requests agree with each other: BTC spot follows a
   smooth random path, strikes and expiries roll like the real schedule, and fair prices use the same
   lognormal model the pricer uses. Spot is anchored to a public BTC price when the browser can fetch one. */

const YEAR_MS = 31_536e6;
const SIGMA = 0.52;
const DEFAULT_SPOT = 91_842.37;
let anchor = DEFAULT_SPOT;
let anchorRequested = false;

const erf = (x: number) => {
  const t = 1 / (1 + .3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
};
const normal = (x: number) => .5 * (1 + erf(x / Math.SQRT2));
const clamp = (p: number) => Math.min(.99, Math.max(.01, p));
const hash = (n: number) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

/* smooth value noise in [-1, 1] */
function noise(x: number): number {
  const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
  return (hash(i) * (1 - s) + hash(i + 1) * s) * 2 - 1;
}

/** Simulated BTC spot at a time. */
export function spotAt(ms: number): number {
  return anchor * (1 + .003 * noise(ms / 7.2e6) + .0009 * noise(ms / 9e5 + 101) + .0003 * noise(ms / 6e4 + 211) + .00008 * noise(ms / 3e3 + 307));
}

function fair(spot: number, strike: number, msLeft: number): number {
  const years = Math.max(msLeft, 1000) / YEAR_MS;
  return clamp(normal((Math.log(spot / strike) - .5 * SIGMA * SIGMA * years) / (SIGMA * Math.sqrt(years))));
}

/* anchor the simulated path near the real BTC price; best effort, in the browser only */
function requestAnchor() {
  if (anchorRequested || typeof window === "undefined" || typeof fetch !== "function") return;
  anchorRequested = true;
  void fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot")
    .then((response) => response.ok ? response.json() as Promise<{ data?: { amount?: string } }> : undefined)
    .then((body) => { const value = Number(body?.data?.amount); if (Number.isFinite(value) && value > 1000) anchor = value; })
    .catch(() => undefined);
}

interface Expiry { duration: string; openTs: number; expiryTs: number; step: number }

function expiries(now: number): Expiry[] {
  const quarter = 15 * 60e3;
  const q0 = Math.floor(now / quarter) * quarter;
  const hour = new Date(now); hour.setMinutes(0, 0, 0);
  const nextHour = hour.getTime() + 3600e3;
  const at4pm = (date: Date) => { const d = new Date(date); d.setHours(16, 0, 0, 0); return d.getTime(); };
  const today4 = at4pm(new Date(now));
  const daily = today4 > now + 60e3 ? today4 : today4 + 86_400e3;
  const weekDay = new Date(daily); weekDay.setDate(weekDay.getDate() + ((5 - weekDay.getDay() + 7) % 7 || 7));
  const monthEnd = new Date(now); monthEnd.setMonth(monthEnd.getMonth() + 1, 0);
  let monthTs = at4pm(monthEnd);
  if (monthTs - now < 3 * 86_400e3) { const next = new Date(now); next.setMonth(next.getMonth() + 2, 0); monthTs = at4pm(next); }
  return [
    { duration: "15m", openTs: q0, expiryTs: q0 + quarter, step: 0 },
    { duration: "1h", openTs: nextHour - 3600e3, expiryTs: nextHour, step: 500 },
    { duration: "1d", openTs: daily - 86_400e3, expiryTs: daily, step: 1000 },
    { duration: "1w", openTs: at4pm(weekDay) - 7 * 86_400e3, expiryTs: at4pm(weekDay), step: 2500 },
    { duration: "month-end", openTs: monthTs - 30 * 86_400e3, expiryTs: monthTs, step: 2500 },
  ];
}

const leverageCap = (strike: number, spot: number) => Math.max(2, Math.min(300, Math.round(300 * (1 - Math.exp(-Math.abs(Math.log(strike / spot)) * 40)))));
/* Gemini's quote drifts a few cents from fair, deterministically per market */
const geminiOffset = (key: number) => (hash(key) - .5) * .06;

function quote(theo: number, key: number, spot: number, strike: number, now: number): PricerMarket["gemini"] {
  const mid = clamp(theo + geminiOffset(key));
  if (Math.abs(strike / spot - 1) > .05 && hash(key + 3) > .4) return hash(key + 5) > .5 ? { bid: Math.max(.01, mid - .03), ts: now } : { ts: now };
  const half = .01 + .01 * hash(key + 7);
  return { bid: Math.max(0, +(mid - half).toFixed(2)), ask: Math.min(1, +(mid + half).toFixed(2)), mid, ts: now };
}

function marketsAt(now: number): PricerMarket[] {
  const spot = spotAt(now);
  const out: PricerMarket[] = [];
  for (const expiry of expiries(now)) {
    if (expiry.step === 0) {
      const strike = +spotAt(expiry.openTs).toFixed(2);
      const theo = fair(spot, strike, expiry.expiryTs - now);
      const key = expiry.openTs / 1000;
      const gemini = quote(theo, key, spot, strike, now);
      out.push({ symbol: `BTC15M-UP-${new Date(expiry.expiryTs).toISOString().slice(11, 16).replace(":", "")}`, eventTicker: "BTC15M", kind: "up_down", duration: "15m", title: "BTC up in 15m",
        strike, openTs: expiry.openTs, expiryTs: expiry.expiryTs, spot, theo, gemini, ...(gemini.mid !== undefined ? { edge: theo - gemini.mid } : {}),
        maxLeverage: 42, status: "open", volSource: "deribit" });
      continue;
    }
    const center = anchor;
    for (let strike = Math.ceil(center * .9 / expiry.step) * expiry.step; strike <= center * 1.1; strike += expiry.step) {
      const theo = fair(spot, strike, expiry.expiryTs - now);
      const key = strike + expiry.expiryTs / 1e7;
      const gemini = quote(theo, key, spot, strike, now);
      out.push({ symbol: `BTC-${expiry.duration}-${strike}`, eventTicker: `BTC${expiry.duration}`, kind: "ladder", duration: expiry.duration, title: `BTC above ${strike}`,
        strike, openTs: expiry.openTs, expiryTs: expiry.expiryTs, spot, theo, gemini, ...(gemini.mid !== undefined ? { edge: theo - gemini.mid } : {}),
        maxLeverage: leverageCap(strike, spot), status: "open", volSource: "deribit" });
    }
  }
  return out;
}

function historyFor(symbol: string, now: number): MarketHistoryPoint[] {
  const market = marketsAt(now).find((item) => item.symbol === symbol);
  if (!market) return [];
  const key = market.kind === "up_down" ? market.openTs / 1000 : market.strike + market.expiryTs / 1e7;
  const start = Math.max(market.openTs, now - 30 * 60e3);
  const points: MarketHistoryPoint[] = [];
  for (let ts = Math.ceil(start / 5000) * 5000; ts < now; ts += 5000) {
    const spot = spotAt(ts);
    const theo = fair(spot, market.strike, market.expiryTs - ts);
    points.push({ ts, theo, geminiMid: clamp(theo + geminiOffset(key) + .01 * noise(ts / 6e4 + key)), spot });
  }
  return points;
}

const signature = (seed: number) => {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  return Array.from({ length: 88 }, (_, i) => alphabet[Math.floor(hash(seed * 97 + i) * alphabet.length)]).join("");
};

function lpHistory(now: number) {
  const hourNow = Math.floor(now / 3600e3);
  return Array.from({ length: 72 }, (_, i) => {
    const hour = hourNow - 71 + i;
    const balance = 25_000 + i * 310 + 1400 * noise(hour / 5) + 600 * noise(hour / 1.5 + 50);
    return { blockTime: hour * 3600, balanceE6: String(Math.round(balance * 1e6)), queueOwedE6: "0", feesE6: String(Math.round((1200 + i * 21.5) * 1e6)), signature: signature(hour) };
  });
}

const EVENT_NAMES = ["PositionOpened", "PositionOpened", "PositionClosed", "LpUpdated", "PositionOpened", "ClaimPaid", "PositionLiquidated", "MarketSettled", "Staked", "RewardsClaimed"];
function feed(now: number): IndexedEvent[] {
  const slotNow = Math.floor(now / 37_000);
  return Array.from({ length: 20 }, (_, i) => {
    const slot = slotNow - i;
    return { signature: signature(slot + 1e6), eventIndex: 0, slot: 320_000_000 + slot % 1e7, blockTime: Math.floor(slot * 37 - hash(slot) * 20),
      name: EVENT_NAMES[Math.floor(hash(slot + 9) * EVENT_NAMES.length)]!, data: {}, provenance: "quicknode_stream" as const };
  });
}

/** Answers a backend GET path with simulated data, in the backend's response shapes. */
export function simulate(path: string, now = Date.now()): unknown {
  requestAnchor();
  const url = new URL(path, "http://demo");
  const history = /^\/markets\/(.+)\/history$/.exec(url.pathname);
  if (history) return historyFor(decodeURIComponent(history[1]!), now);
  switch (url.pathname) {
    case "/markets": return marketsAt(now);
    case "/health": return { ok: true, chainConfigured: false, volHealthy: true, volSource: "deribit", geminiHealthy: true, markAgeMs: 400, discoveryAgeMs: 2000 };
    case "/lp/history": return lpHistory(now);
    case "/feed": return feed(now);
    case "/positions": case "/claims": return [];
    default: throw new Error(`No demo data for ${url.pathname}`);
  }
}
