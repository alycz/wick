import { normalCdf } from "./normal.js";

export const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
export const MIN_PROBABILITY = 0.01;
export const MAX_PROBABILITY = 0.99;

export interface BinaryTheoInput {
  spot: number;
  strike: number;
  volatility: number;
  timeYears: number;
  twapAdjustment?: boolean;
  twapWindowSeconds?: number;
}

export interface BinaryTheoResult {
  probability: number;
  unclampedProbability: number;
  d2: number;
  effectiveVariance: number;
}

function requirePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive`);
}

export function clampProbability(value: number): number {
  return Math.min(MAX_PROBABILITY, Math.max(MIN_PROBABILITY, value));
}

export function effectiveVariance(
  volatility: number,
  timeYears: number,
  twapAdjustment = true,
  twapWindowSeconds = 60,
): number {
  requirePositive(volatility, "volatility");
  if (!Number.isFinite(timeYears) || timeYears < 0) throw new RangeError("timeYears must be non-negative");
  if (!twapAdjustment || timeYears === 0) return volatility * volatility * timeYears;
  if (!Number.isFinite(twapWindowSeconds) || twapWindowSeconds < 0) {
    throw new RangeError("twapWindowSeconds must be non-negative");
  }
  const windowYears = twapWindowSeconds / SECONDS_PER_YEAR;
  const ordinary = Math.max(timeYears - windowYears, 0);
  const averaged = Math.min(timeYears, windowYears) / 3;
  return volatility * volatility * (ordinary + averaged);
}

export function binaryD2(input: BinaryTheoInput): { d2: number; variance: number } {
  requirePositive(input.spot, "spot");
  requirePositive(input.strike, "strike");
  const variance = effectiveVariance(
    input.volatility,
    input.timeYears,
    input.twapAdjustment ?? true,
    input.twapWindowSeconds ?? 60,
  );
  if (variance === 0) {
    if (input.spot === input.strike) return { d2: 0, variance };
    return { d2: input.spot > input.strike ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY, variance };
  }
  return {
    d2: (Math.log(input.spot / input.strike) - variance / 2) / Math.sqrt(variance),
    variance,
  };
}

export function upDownTheo(input: BinaryTheoInput): BinaryTheoResult {
  const { d2, variance } = binaryD2(input);
  const unclampedProbability = normalCdf(d2);
  return {
    probability: clampProbability(unclampedProbability),
    unclampedProbability,
    d2,
    effectiveVariance: variance,
  };
}

export function black76Call(forward: number, strike: number, volatility: number, timeYears: number): number {
  requirePositive(forward, "forward");
  requirePositive(strike, "strike");
  requirePositive(volatility, "volatility");
  if (!Number.isFinite(timeYears) || timeYears < 0) throw new RangeError("timeYears must be non-negative");
  if (timeYears === 0) return Math.max(forward - strike, 0);
  const standardDeviation = volatility * Math.sqrt(timeYears);
  const d1 = (Math.log(forward / strike) + 0.5 * standardDeviation * standardDeviation) / standardDeviation;
  const d2 = d1 - standardDeviation;
  return forward * normalCdf(d1) - strike * normalCdf(d2);
}

export interface LadderTheoInput {
  forward: number;
  strike: number;
  timeYears: number;
  volAtStrike: (strike: number) => number;
  halfWidthFraction?: number;
}

export function ladderTheo(input: LadderTheoInput): number {
  requirePositive(input.forward, "forward");
  requirePositive(input.strike, "strike");
  if (!Number.isFinite(input.timeYears) || input.timeYears < 0) throw new RangeError("timeYears must be non-negative");
  const halfWidth = input.strike * (input.halfWidthFraction ?? 0.0025);
  requirePositive(halfWidth, "call-spread half-width");
  const lowerStrike = input.strike - halfWidth;
  const upperStrike = input.strike + halfWidth;
  const lowerCall = black76Call(input.forward, lowerStrike, input.volAtStrike(lowerStrike), input.timeYears);
  const upperCall = black76Call(input.forward, upperStrike, input.volAtStrike(upperStrike), input.timeYears);
  return clampProbability((lowerCall - upperCall) / (2 * halfWidth));
}
