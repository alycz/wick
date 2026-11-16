import type { Clock, VolPoint } from "./types.js";

const YEAR_MS = 365 * 24 * 60 * 60 * 1_000;

interface SmilePoint { x: number; vol: number }

function naturalSpline(xs: number[], ys: number[], x: number): number {
  if (xs.length === 0 || ys.length !== xs.length) throw new Error("invalid smile");
  if (xs.length === 1) return ys[0] as number;
  if (x <= (xs[0] as number)) return ys[0] as number;
  if (x >= (xs.at(-1) as number)) return ys.at(-1) as number;

  const n = xs.length;
  const second = Array<number>(n).fill(0);
  const u = Array<number>(n - 1).fill(0);
  for (let i = 1; i < n - 1; i += 1) {
    const xPrev = xs[i - 1] as number;
    const xHere = xs[i] as number;
    const xNext = xs[i + 1] as number;
    const sig = (xHere - xPrev) / (xNext - xPrev);
    const p = sig * (second[i - 1] as number) + 2;
    second[i] = (sig - 1) / p;
    const slopeNext = ((ys[i + 1] as number) - (ys[i] as number)) / (xNext - xHere);
    const slopePrev = ((ys[i] as number) - (ys[i - 1] as number)) / (xHere - xPrev);
    u[i] = (6 * (slopeNext - slopePrev) / (xNext - xPrev) - sig * (u[i - 1] as number)) / p;
  }
  for (let k = n - 2; k >= 0; k -= 1) {
    second[k] = (second[k] as number) * (second[k + 1] as number) + (u[k] ?? 0);
  }

  let lower = 0;
  let upper = n - 1;
  while (upper - lower > 1) {
    const middle = Math.floor((upper + lower) / 2);
    if ((xs[middle] as number) > x) upper = middle;
    else lower = middle;
  }
  const width = (xs[upper] as number) - (xs[lower] as number);
  const a = ((xs[upper] as number) - x) / width;
  const b = (x - (xs[lower] as number)) / width;
  return a * (ys[lower] as number) + b * (ys[upper] as number)
    + (((a ** 3 - a) * (second[lower] as number) + (b ** 3 - b) * (second[upper] as number)) * width ** 2) / 6;
}

export class VolSurface {
  private readonly byExpiry = new Map<number, VolPoint[]>();
  private updatedAt = 0;

  constructor(private readonly now: Clock = Date.now) {}

  replace(points: readonly VolPoint[]): void {
    const grouped = new Map<number, Map<number, VolPoint[]>>();
    for (const point of points) {
      if (!Number.isFinite(point.vol) || point.vol <= 0 || point.vol > 5) continue;
      if (!Number.isFinite(point.strike) || point.strike <= 0 || point.expiryMs <= this.now()) continue;
      const byStrike = grouped.get(point.expiryMs) ?? new Map<number, VolPoint[]>();
      const values = byStrike.get(point.strike) ?? [];
      values.push(point);
      byStrike.set(point.strike, values);
      grouped.set(point.expiryMs, byStrike);
    }

    this.byExpiry.clear();
    for (const [expiry, byStrike] of grouped) {
      const collapsed: VolPoint[] = [];
      for (const [strike, duplicates] of byStrike) {
        const count = duplicates.length;
        collapsed.push({
          expiryMs: expiry,
          strike,
          vol: duplicates.reduce((sum, point) => sum + point.vol, 0) / count,
          forward: duplicates.reduce((sum, point) => sum + point.forward, 0) / count,
          ts: Math.max(...duplicates.map((point) => point.ts)),
        });
      }
      collapsed.sort((a, b) => a.strike - b.strike);
      if (collapsed.length > 0) this.byExpiry.set(expiry, collapsed);
    }
    this.updatedAt = points.length > 0 ? Math.max(...points.map((point) => point.ts)) : 0;
  }

  lastUpdatedAt(): number { return this.updatedAt; }
  expiries(): number[] { return [...this.byExpiry.keys()].sort((a, b) => a - b); }
  pointCount(): number { return [...this.byExpiry.values()].reduce((sum, points) => sum + points.length, 0); }

  vol(expiryMs: number, strike: number): number {
    if (!Number.isFinite(strike) || strike <= 0) throw new RangeError("strike must be positive");
    const expiries = this.expiries();
    if (expiries.length === 0) throw new Error("vol surface is empty");
    const first = expiries[0] as number;
    const last = expiries.at(-1) as number;
    if (expiryMs <= first) return this.smile(first, strike);
    if (expiryMs >= last) return this.smile(last, strike);

    let upperIndex = expiries.findIndex((value) => value >= expiryMs);
    if (upperIndex <= 0) upperIndex = 1;
    const lowerExpiry = expiries[upperIndex - 1] as number;
    const upperExpiry = expiries[upperIndex] as number;
    const lowerVol = this.smile(lowerExpiry, strike);
    const upperVol = this.smile(upperExpiry, strike);
    const now = this.now();
    const lowerT = Math.max((lowerExpiry - now) / YEAR_MS, 1 / YEAR_MS);
    const upperT = Math.max((upperExpiry - now) / YEAR_MS, lowerT);
    const targetT = Math.max((expiryMs - now) / YEAR_MS, 1 / YEAR_MS);
    const weight = (expiryMs - lowerExpiry) / (upperExpiry - lowerExpiry);
    const variance = lowerVol ** 2 * lowerT * (1 - weight) + upperVol ** 2 * upperT * weight;
    return Math.sqrt(Math.max(variance / targetT, 0));
  }

  private smile(expiryMs: number, strike: number): number {
    const points = this.byExpiry.get(expiryMs);
    if (!points || points.length === 0) throw new Error(`missing expiry ${expiryMs}`);
    const smile: SmilePoint[] = points.map((point) => ({
      x: Math.log(point.strike / (point.forward > 0 ? point.forward : strike)),
      vol: point.vol,
    })).sort((a, b) => a.x - b.x);
    const forward = points.reduce((sum, point) => sum + point.forward, 0) / points.length;
    return naturalSpline(smile.map((point) => point.x), smile.map((point) => point.vol), Math.log(strike / forward));
  }
}
