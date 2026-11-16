import { SECONDS_PER_YEAR } from "./theo.js";

export interface VolPoint { strike: number; volatility: number }
export interface ExpirySmile { expiryMs: number; points: readonly VolPoint[] }

interface SplinePoint { x: number; y: number }

function validatedPoints(points: readonly VolPoint[], forward: number): SplinePoint[] {
  if (!Number.isFinite(forward) || forward <= 0) throw new RangeError("forward must be positive");
  if (points.length === 0) throw new RangeError("smile needs at least one point");
  const sorted = points.map(({ strike, volatility }) => {
    if (!Number.isFinite(strike) || strike <= 0) throw new RangeError("strike must be positive");
    if (!Number.isFinite(volatility) || volatility <= 0) throw new RangeError("volatility must be positive");
    return { x: Math.log(strike / forward), y: volatility };
  }).sort((left, right) => left.x - right.x);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index]!.x === sorted[index - 1]!.x) throw new RangeError("smile strikes must be unique");
  }
  return sorted;
}

/** Natural cubic spline in log-moneyness, with flat wing extrapolation. */
export function smileVol(points: readonly VolPoint[], forward: number, strike: number): number {
  if (!Number.isFinite(strike) || strike <= 0) throw new RangeError("strike must be positive");
  const samples = validatedPoints(points, forward);
  if (samples.length === 1) return samples[0]!.y;
  const x = Math.log(strike / forward);
  if (x <= samples[0]!.x) return samples[0]!.y;
  if (x >= samples[samples.length - 1]!.x) return samples[samples.length - 1]!.y;

  const second = new Array<number>(samples.length).fill(0);
  const u = new Array<number>(samples.length - 1).fill(0);
  for (let index = 1; index < samples.length - 1; index += 1) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    const next = samples[index + 1]!;
    const sigma = (current.x - previous.x) / (next.x - previous.x);
    const p = sigma * second[index - 1]! + 2;
    second[index] = (sigma - 1) / p;
    const slopeChange = (next.y - current.y) / (next.x - current.x)
      - (current.y - previous.y) / (current.x - previous.x);
    u[index] = (6 * slopeChange / (next.x - previous.x) - sigma * u[index - 1]!) / p;
  }
  for (let index = samples.length - 2; index >= 0; index -= 1) {
    second[index] = second[index]! * second[index + 1]! + u[index]!;
  }

  let lower = 0;
  let upper = samples.length - 1;
  while (upper - lower > 1) {
    const middle = Math.floor((upper + lower) / 2);
    if (samples[middle]!.x > x) upper = middle;
    else lower = middle;
  }
  const low = samples[lower]!;
  const high = samples[upper]!;
  const width = high.x - low.x;
  const a = (high.x - x) / width;
  const b = (x - low.x) / width;
  const result = a * low.y + b * high.y
    + ((a * a * a - a) * second[lower]! + (b * b * b - b) * second[upper]!) * width * width / 6;
  return Math.max(Number.EPSILON, result);
}

/** Interpolates total variance between expiry smiles. */
export function surfaceVol(
  smiles: readonly ExpirySmile[],
  targetExpiryMs: number,
  strike: number,
  forward: number,
  nowMs = Date.now(),
): number {
  if (targetExpiryMs <= nowMs) throw new RangeError("target expiry must be in the future");
  if (smiles.length === 0) throw new RangeError("surface needs at least one expiry");
  const sorted = [...smiles].sort((left, right) => left.expiryMs - right.expiryMs);
  const live = sorted.filter((smile) => smile.expiryMs > nowMs);
  if (live.length === 0) throw new RangeError("surface has no live expiries");
  const targetYears = (targetExpiryMs - nowMs) / 1_000 / SECONDS_PER_YEAR;
  const first = live[0]!;
  if (targetExpiryMs <= first.expiryMs) return smileVol(first.points, forward, strike);
  const last = live[live.length - 1]!;
  if (targetExpiryMs >= last.expiryMs) return smileVol(last.points, forward, strike);

  const upperIndex = live.findIndex((smile) => smile.expiryMs >= targetExpiryMs);
  const lower = live[upperIndex - 1]!;
  const upper = live[upperIndex]!;
  const lowerYears = (lower.expiryMs - nowMs) / 1_000 / SECONDS_PER_YEAR;
  const upperYears = (upper.expiryMs - nowMs) / 1_000 / SECONDS_PER_YEAR;
  const lowerVol = smileVol(lower.points, forward, strike);
  const upperVol = smileVol(upper.points, forward, strike);
  const lowerVariance = lowerVol * lowerVol * lowerYears;
  const upperVariance = upperVol * upperVol * upperYears;
  const weight = (targetYears - lowerYears) / (upperYears - lowerYears);
  const targetVariance = lowerVariance + weight * (upperVariance - lowerVariance);
  return Math.sqrt(Math.max(0, targetVariance / targetYears));
}
