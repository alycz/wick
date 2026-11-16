import { describe, expect, it } from "vitest";
import { VolSurface } from "../src/surface.js";

describe("VolSurface", () => {
  it("interpolates the smile and total variance across expiries", () => {
    const now = Date.UTC(2026, 10, 16, 0, 0, 0);
    const first = now + 24 * 60 * 60_000;
    const second = now + 3 * 24 * 60 * 60_000;
    const surface = new VolSurface(() => now);
    surface.replace([
      { expiryMs: first, strike: 60_000, vol: 0.55, forward: 65_000, ts: now },
      { expiryMs: first, strike: 65_000, vol: 0.50, forward: 65_000, ts: now },
      { expiryMs: first, strike: 70_000, vol: 0.52, forward: 65_000, ts: now },
      { expiryMs: second, strike: 60_000, vol: 0.60, forward: 65_500, ts: now },
      { expiryMs: second, strike: 65_000, vol: 0.56, forward: 65_500, ts: now },
      { expiryMs: second, strike: 70_000, vol: 0.57, forward: 65_500, ts: now },
    ]);
    expect(surface.vol(first, 65_000)).toBeCloseTo(0.5, 8);
    expect(surface.vol(now + 2 * 24 * 60 * 60_000, 65_000)).toBeGreaterThan(0.5);
    expect(surface.vol(now + 2 * 24 * 60 * 60_000, 65_000)).toBeLessThan(0.6);
  });

  it("uses flat smile extrapolation outside the quoted strikes", () => {
    const now = 1_000_000;
    const expiry = now + 1_000_000;
    const surface = new VolSurface(() => now);
    surface.replace([
      { expiryMs: expiry, strike: 60_000, vol: 0.6, forward: 65_000, ts: now },
      { expiryMs: expiry, strike: 70_000, vol: 0.4, forward: 65_000, ts: now },
    ]);
    expect(surface.vol(expiry, 40_000)).toBe(0.6);
    expect(surface.vol(expiry, 90_000)).toBe(0.4);
  });
});
