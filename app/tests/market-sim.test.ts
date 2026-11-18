import { describe, expect, it } from "vitest";
import { simulate, spotAt } from "@/lib/demo/market-sim";

const NOW = Date.UTC(2026, 10, 18, 15, 7, 0);

describe("demo market simulator", () => {
  it("serves an open market for every expiry, priced from spot", () => {
    const markets = simulate("/markets", NOW) as Array<{ duration: string; kind: string; theo: number; spot: number; strike: number; expiryTs: number; status: string }>;
    expect(new Set(markets.map((market) => market.duration))).toEqual(new Set(["15m", "1h", "1d", "1w", "month-end"]));
    expect(markets.filter((market) => market.kind === "up_down")).toHaveLength(1);
    for (const market of markets) {
      expect(market.status).toBe("open");
      expect(market.expiryTs).toBeGreaterThan(NOW);
      expect(market.theo).toBeGreaterThanOrEqual(.01);
      expect(market.theo).toBeLessThanOrEqual(.99);
    }
    const ladder = markets.filter((market) => market.duration === "1d").sort((a, b) => a.strike - b.strike);
    expect(ladder[0]!.theo).toBeGreaterThan(ladder.at(-1)!.theo);
  });

  it("returns the same answer for the same moment and a history that ends at the current spot", () => {
    expect(simulate("/markets", NOW)).toEqual(simulate("/markets", NOW));
    const [market] = simulate("/markets", NOW) as Array<{ symbol: string }>;
    const history = simulate(`/markets/${encodeURIComponent(market!.symbol)}/history`, NOW) as Array<{ ts: number; spot: number }>;
    expect(history.length).toBeGreaterThan(10);
    expect(Math.abs(history.at(-1)!.spot - spotAt(NOW))).toBeLessThan(spotAt(NOW) * .002);
  });

  it("has no account data of its own", () => {
    expect(simulate("/positions?owner=x", NOW)).toEqual([]);
    expect(simulate("/claims?owner=x", NOW)).toEqual([]);
  });
});
