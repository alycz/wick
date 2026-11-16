import { describe, expect, it } from "vitest";
import {
  effectiveVariance,
  ladderTheo,
  SECONDS_PER_YEAR,
  smileVol,
  surfaceVol,
  upDownTheo,
} from "../src/index.js";

describe("binary theo", () => {
  const vectors = [
    { spot: 100_000, strike: 100_000, seconds: 10 * 60, expected: 0.499565 },
    { spot: 100_100, strike: 100_000, seconds: 10 * 60, expected: 0.676236 },
    { spot: 99_000, strike: 100_000, seconds: 12 * 60 * 60, expected: 0.290357 },
    { spot: 105_000, strike: 100_000, seconds: 7 * 24 * 60 * 60, expected: 0.748573 },
  ];

  it.each(vectors)("matches the build-spec vector %#", ({ spot, strike, seconds, expected }) => {
    const result = upDownTheo({
      spot,
      strike,
      volatility: 0.5,
      timeYears: seconds / SECONDS_PER_YEAR,
      twapAdjustment: false,
    });
    expect(result.probability).toBeCloseTo(expected, 4);
  });

  it("applies the final-minute TWAP variance adjustment by default", () => {
    const timeYears = 30 / SECONDS_PER_YEAR;
    expect(effectiveVariance(0.6, timeYears)).toBeCloseTo(0.6 ** 2 * timeYears / 3, 15);
    expect(effectiveVariance(0.6, timeYears, false)).toBeCloseTo(0.6 ** 2 * timeYears, 15);
  });

  it("clamps remote-tail probabilities to tradable bounds", () => {
    expect(upDownTheo({ spot: 1, strike: 100_000, volatility: 0.5, timeYears: 1, twapAdjustment: false }).probability).toBe(0.01);
    expect(upDownTheo({ spot: 1_000_000, strike: 1, volatility: 0.5, timeYears: 1, twapAdjustment: false }).probability).toBe(0.99);
  });
});

describe("ladder theo and volatility surface", () => {
  it("matches N(d2) for a flat smile", () => {
    const timeYears = 7 / 365;
    const binary = upDownTheo({ spot: 105_000, strike: 100_000, volatility: 0.5, timeYears, twapAdjustment: false }).probability;
    const ladder = ladderTheo({ forward: 105_000, strike: 100_000, timeYears, volAtStrike: () => 0.5 });
    expect(Math.abs(ladder - binary)).toBeLessThan(1e-3);
  });

  it("uses a cubic smile with flat extrapolation", () => {
    const points = [
      { strike: 80_000, volatility: 0.7 },
      { strike: 100_000, volatility: 0.5 },
      { strike: 120_000, volatility: 0.6 },
    ];
    expect(smileVol(points, 100_000, 50_000)).toBe(0.7);
    expect(smileVol(points, 100_000, 150_000)).toBe(0.6);
    expect(smileVol(points, 100_000, 100_000)).toBeCloseTo(0.5, 12);
    expect(smileVol(points, 100_000, 110_000)).toBeGreaterThan(0.49);
  });

  it("interpolates linearly in total variance", () => {
    const now = Date.UTC(2026, 10, 16);
    const day = 86_400_000;
    const smiles = [
      { expiryMs: now + day, points: [{ strike: 100_000, volatility: 0.4 }] },
      { expiryMs: now + 3 * day, points: [{ strike: 100_000, volatility: 0.6 }] },
    ];
    const result = surfaceVol(smiles, now + 2 * day, 100_000, 100_000, now);
    const expectedVariance = (0.4 ** 2 * 1 / 365 + 0.6 ** 2 * 3 / 365) / 2;
    expect(result).toBeCloseTo(Math.sqrt(expectedVariance / (2 / 365)), 12);
    expect(surfaceVol(smiles, now + day / 2, 100_000, 100_000, now)).toBe(0.4);
  });
});
