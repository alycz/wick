import type { PricingSide } from "./position.js";
import { normalInverse, normalPdf } from "./normal.js";
import { binaryD2, SECONDS_PER_YEAR, upDownTheo } from "./theo.js";

export interface LeverageCapInput {
  probabilitySide: number;
  volatility: number;
  timeYears: number;
  d2?: number;
  maintenanceRatio?: number;
  shockSeconds?: number;
  k?: number;
  globalMax?: number;
}

export interface LeverageCapResult {
  cap: number;
  gammaSensitivity: number;
  markShockSigma: number;
  rawCap: number;
}

export function leverageCap(input: LeverageCapInput): LeverageCapResult {
  const maintenanceRatio = input.maintenanceRatio ?? 0;
  const shockSeconds = input.shockSeconds ?? 5;
  const k = input.k ?? 3;
  const globalMax = input.globalMax ?? 1_000;
  if (!(input.probabilitySide > 0 && input.probabilitySide < 1)) throw new RangeError("probabilitySide must be in (0, 1)");
  if (!(input.volatility > 0) || !(input.timeYears > 0)) throw new RangeError("volatility and timeYears must be positive");
  if (!(maintenanceRatio >= 0 && maintenanceRatio < 1)) throw new RangeError("maintenanceRatio must be in [0, 1)");
  if (!(shockSeconds > 0) || !(k > 0)) throw new RangeError("shockSeconds and k must be positive");
  if (!Number.isSafeInteger(globalMax) || globalMax < 1) throw new RangeError("globalMax must be a positive integer");
  const d2 = input.d2 ?? normalInverse(input.probabilitySide);
  const gammaSensitivity = normalPdf(d2) / (input.volatility * Math.sqrt(input.timeYears));
  const markShockSigma = gammaSensitivity * input.volatility * Math.sqrt(shockSeconds / SECONDS_PER_YEAR);
  const rawCap = input.probabilitySide * (1 - maintenanceRatio) / (k * markShockSigma);
  return {
    cap: Math.min(globalMax, Math.max(1, Math.floor(rawCap))),
    gammaSensitivity,
    markShockSigma,
    rawCap,
  };
}

export interface LiquidationDistanceInput {
  side: PricingSide;
  liqMarkE6: number;
  spot: number;
  strike: number;
  volatility: number;
  timeYears: number;
  twapAdjustment?: boolean;
}

export interface LiquidationDistance {
  priceUsd: number;
  distanceUsd: number;
  distancePct: number;
  iterations: number;
}

export function liqDistance(input: LiquidationDistanceInput): LiquidationDistance {
  if (!Number.isSafeInteger(input.liqMarkE6) || input.liqMarkE6 < 0 || input.liqMarkE6 > 1_000_000) {
    throw new RangeError("liqMarkE6 must be a probability in micro-units");
  }
  if (!(input.spot > 0)) throw new RangeError("spot must be positive");
  const target = input.liqMarkE6 / 1_000_000;
  const sideProbability = (spot: number): number => {
    const yes = upDownTheo({
      spot,
      strike: input.strike,
      volatility: input.volatility,
      timeYears: input.timeYears,
      twapAdjustment: input.twapAdjustment ?? true,
    }).unclampedProbability;
    return input.side === "yes" ? yes : 1 - yes;
  };

  let low = input.spot * 1e-4;
  let high = input.spot * 1e4;
  let iterations = 0;
  for (; iterations < 160; iterations += 1) {
    const middle = Math.sqrt(low * high);
    const value = sideProbability(middle);
    const shouldRaiseLow = input.side === "yes" ? value < target : value > target;
    if (shouldRaiseLow) low = middle;
    else high = middle;
    if (Math.abs(Math.log(high / low)) < 1e-12) break;
  }
  const priceUsd = Math.sqrt(low * high);
  return {
    priceUsd,
    distanceUsd: priceUsd - input.spot,
    distancePct: (priceUsd / input.spot - 1) * 100,
    iterations: iterations + 1,
  };
}

export function d2ForRisk(spot: number, strike: number, volatility: number, timeYears: number): number {
  return binaryD2({ spot, strike, volatility, timeYears, twapAdjustment: false }).d2;
}
