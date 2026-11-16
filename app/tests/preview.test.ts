import { describe, expect, it } from "vitest";
import type { PricerMarket } from "@wick/shared";
import { tradePreview } from "@/lib/preview";

const market: PricerMarket = {
  symbol: "GEMI-BTC15M-UP", eventTicker: "BTC15M", kind: "up_down", duration: "15m", title: "BTC up?",
  strike: 65_000, openTs: 1, expiryTs: 2, spot: 65_100, theo: 0.55,
  gemini: { bid: 0.53, ask: 0.57, mid: 0.55, ts: 1 }, edge: 0, maxLeverage: 4, status: "open", volSource: "deribit",
};

describe("tradePreview", () => {
  it("matches fixed-point entry, contracts, payout, and fee math", () => {
    const result = tradePreview(market, "yes", 100, 4, []);
    expect(result.entry).toBe(0.555);
    expect(result.contracts).toBeCloseTo(720.72072, 5);
    expect(result.maxPayout).toBeCloseTo(320.72072, 5);
    expect(result.feeAtMaxProfit).toBeCloseTo(6.4144144, 5);
  });

  it("uses verified history sensitivity for a liquidation-price estimate", () => {
    const result = tradePreview(market, "yes", 100, 4, [{ ts: 0, spot: 65_000, theo: 0.5 }]);
    expect(result.liquidationPrice).toBeDefined();
    expect(result.liquidationPct).toBeLessThan(0);
  });
});
