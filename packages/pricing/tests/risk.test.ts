import { describe, expect, it } from "vitest";
import { leverageCap, liqDistance, SECONDS_PER_YEAR, upDownTheo } from "../src/index.js";

describe("binary-gamma leverage cap", () => {
  it("matches the required 15-minute, daily and 30-day cap vectors", () => {
    const common = { probabilitySide: 0.5, volatility: 0.5, d2: 0 };
    expect(leverageCap({ ...common, timeYears: 10 * 60 / SECONDS_PER_YEAR }).cap).toBe(4);
    expect(leverageCap({ ...common, timeYears: 12 * 60 * 60 / SECONDS_PER_YEAR }).cap).toBe(38);
    expect(leverageCap({ ...common, timeYears: 30 / 365, globalMax: 300 }).cap).toBe(300);
    expect(leverageCap({ ...common, timeYears: 30 / 365, k: 1 }).cap).toBe(902);
  });

  it("uses the side probability's implied d2 when d2 is omitted", () => {
    expect(leverageCap({ probabilitySide: 0.5, volatility: 0.5, timeYears: 10 * 60 / SECONDS_PER_YEAR }).cap).toBe(4);
    expect(leverageCap({ probabilitySide: 0.01, volatility: 0.5, timeYears: 10 * 60 / SECONDS_PER_YEAR }).cap).toBeGreaterThanOrEqual(1);
  });
});

describe("liquidation distance", () => {
  it("solves the BTC price where a YES mark reaches the stored liquidation mark", () => {
    const result = liqDistance({
      side: "yes",
      liqMarkE6: 400_000,
      spot: 100_000,
      strike: 100_000,
      volatility: 0.5,
      timeYears: 10 * 60 / SECONDS_PER_YEAR,
      twapAdjustment: false,
    });
    const solved = upDownTheo({
      spot: result.priceUsd,
      strike: 100_000,
      volatility: 0.5,
      timeYears: 10 * 60 / SECONDS_PER_YEAR,
      twapAdjustment: false,
    }).unclampedProbability;
    expect(solved).toBeCloseTo(0.4, 7);
    expect(result.distancePct).toBeLessThan(0);
  });

  it("moves upward for a NO position's adverse liquidation price", () => {
    const result = liqDistance({
      side: "no",
      liqMarkE6: 400_000,
      spot: 100_000,
      strike: 100_000,
      volatility: 0.5,
      timeYears: 10 * 60 / SECONDS_PER_YEAR,
      twapAdjustment: false,
    });
    expect(result.distancePct).toBeGreaterThan(0);
  });
});
