import type { PricerMarket } from "@wick/shared";

/* Pure helpers for the Markets page: expiry groups, default strike, implied vol and the settlement density. */

export interface ExpiryGroup {
  id: string;
  duration: string;
  /** Short label for pills and the dropdown: "15 min", "5:00 PM", "Nov 18". */
  label: string;
  /** Longer name: "15 min", "Hourly", "Daily", "Weekly", "Month-end". */
  name: string;
  expiryTs: number;
  upDown: boolean;
  markets: PricerMarket[];
}

const YEAR_MS = 31_536e6;
const NAMES: Record<string, string> = { "15m": "15 min", "5m": "5 min", "1h": "Hourly", "1d": "Daily", "1w": "Weekly", "month-end": "Month-end" };
const ORDER = ["15m", "5m", "1h", "1d", "1w", "month-end"];

export const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
export const dateLabel = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const utcSettlement = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC", timeZoneName: "short",
});
export const settlementUtc = (ms: number) => utcSettlement.format(ms);

export function validQuote(bid?: number, ask?: number, mid?: number) {
  const valid = (p?: number) => p === undefined || (Number.isFinite(p) && p >= 0 && p <= 1);
  return valid(bid) && valid(ask) && valid(mid) && (bid === undefined || ask === undefined || bid <= ask);
}

/** Group dated strikes by event and show the nearest open window for each Up/Down duration. */
export function expiryGroups(markets: readonly PricerMarket[], now = Date.now()): ExpiryGroup[] {
  const byEvent = new Map<string, PricerMarket[]>();
  for (const market of markets) {
    if (market.status !== "open" || market.expiryTs <= now || (market.kind === "up_down" && market.openTs > now)) continue;
    const id = market.kind === "up_down" ? market.duration : `${market.eventTicker}:${market.expiryTs}`;
    const list = byEvent.get(id) ?? [];
    list.push(market);
    byEvent.set(id, list);
  }
  const groups: ExpiryGroup[] = [];
  for (const [id, list] of byEvent) {
    const { duration, kind } = list[0]!;
    const expiryTs = Math.min(...list.map((market) => market.expiryTs));
    const upDown = kind === "up_down";
    const current = list.filter((market) => market.expiryTs === expiryTs).sort((a, b) => a.strike - b.strike);
    const chosen = upDown ? current.slice(0, 1) : current;
    const label = upDown ? NAMES[duration] ?? duration : duration === "1h" ? timeLabel(expiryTs) : dateLabel(expiryTs);
    groups.push({ id, duration, label, name: NAMES[duration] ?? duration, expiryTs, upDown, markets: chosen });
  }
  const rank = (id: string) => { const index = ORDER.indexOf(id); return index < 0 ? ORDER.length : index; };
  return groups.sort((a, b) => rank(a.duration) - rank(b.duration) || a.expiryTs - b.expiryTs);
}

/** The strike closest to an even chance. */
export function defaultStrike(markets: readonly PricerMarket[]): PricerMarket | undefined {
  return markets.reduce<PricerMarket | undefined>((best, market) => !best || Math.abs(market.theo - .5) < Math.abs(best.theo - .5) ? market : best, undefined);
}

const erf = (x: number) => {
  const t = 1 / (1 + .3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
};
const normal = (x: number) => .5 * (1 + erf(x / Math.SQRT2));

export const yearsLeft = (expiryTs: number, now = Date.now()) => Math.max(expiryTs - now, 60_000) / YEAR_MS;

/** Chance of finishing above `strike` under a lognormal with volatility `sigma`. */
export function aboveChance(spot: number, strike: number, sigma: number, years: number): number {
  const v = sigma * Math.sqrt(years);
  return normal((Math.log(spot / strike) - .5 * v * v) / v);
}

/** The volatility that reproduces Wick's own ladder prices: median of per-strike implied vols. */
export function impliedVol(markets: readonly PricerMarket[], now = Date.now()): number | undefined {
  const vols: number[] = [];
  for (const market of markets) {
    if (market.theo <= .04 || market.theo >= .96 || market.spot <= 0 || market.strike <= 0) continue;
    const years = yearsLeft(market.expiryTs, now);
    let low = .01; let high = 5;
    // chance above a strike over spot rises with vol, below spot it falls
    const rising = market.strike > market.spot;
    for (let step = 0; step < 60; step += 1) {
      const mid = (low + high) / 2;
      const chance = aboveChance(market.spot, market.strike, mid, years);
      if ((chance < market.theo) === rising) low = mid; else high = mid;
    }
    const sigma = (low + high) / 2;
    if (sigma > .02 && sigma < 4.9) vols.push(sigma);
  }
  if (!vols.length) return undefined;
  vols.sort((a, b) => a - b);
  return vols[Math.floor(vols.length / 2)];
}

/** Lognormal density of where BTC settles. */
export function settleDensity(spot: number, sigma: number, years: number): (price: number) => number {
  const v = sigma * Math.sqrt(years);
  const m = Math.log(spot) - .5 * v * v;
  return (price: number) => Math.exp(-((Math.log(price) - m) ** 2) / (2 * v * v)) / (price * v * Math.sqrt(2 * Math.PI));
}

/** Countdown parts: days/hours/mins when over a day, else hours/mins/secs, else mins/secs. */
export function clockParts(msLeft: number): Array<[string, string]> {
  const seconds = Math.max(0, Math.floor(msLeft / 1000));
  const d = Math.floor(seconds / 86_400); const h = Math.floor(seconds % 86_400 / 3_600);
  const m = Math.floor(seconds % 3_600 / 60); const s = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  if (d > 0) return [[pad(d), "d"], [pad(h), "h"], [pad(m), "m"]];
  if (h > 0) return [[pad(h), "h"], [pad(m), "m"], [pad(s), "s"]];
  return [[pad(m), "m"], [pad(s), "s"]];
}

export function shortLeft(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  if (s >= 86_400) return `${Math.floor(s / 86_400)}d ${Math.floor(s % 86_400 / 3_600)}h`;
  if (s >= 3_600) return `${Math.floor(s / 3_600)}h ${Math.floor(s % 3_600 / 60)}m`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** "$92k", "$92.5k" */
export const kLabel = (strike: number) => `${(strike / 1000).toFixed(strike % 1000 ? 1 : 0)}k`;

export const usd = (value: number, digits = 2) => `${value < 0 ? "−" : ""}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const signed = (value: number, format: (v: number) => string) => `${value >= 0 ? "+" : "−"}${format(Math.abs(value))}`;
