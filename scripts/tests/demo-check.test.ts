import { describe, expect, it } from "vitest";
import { evaluateDemoSnapshot } from "../lib/demo-check.js";

const now = 1_800_000_000_000;
const market = {
  symbol: "GEMI-BTC15M-UP", eventTicker: "BTC15M", kind: "up_down" as const, duration: "15m", title: "BTC up",
  strike: 65_000, openTs: now - 60_000, expiryTs: now + 600_000, spot: 65_100, theo: 0.5,
  gemini: { bid: 0.49, ask: 0.51, mid: 0.5, ts: now }, maxLeverage: 4, status: "open" as const, volSource: "deribit" as const,
};

describe("evaluateDemoSnapshot", () => {
  it("accepts only a fully live, funded demo", () => {
    expect(evaluateDemoSnapshot({
      health: { ok: true, chainConfigured: true, indexerConfigured: true, markAgeMs: 1_000, indexerEventAgeMs: 2_000 },
      markets: [market], feed: [{ blockTime: (now - 2_000) / 1_000 }], vaultAmountE6: 1n,
      keeperLamports: 500_000_000, treasuryLamports: 2_000_000_000, nowMs: now,
    })).toMatchObject({ ok: true, liveMarket: market.symbol, vaultBalanceE6: "1" });
  });

  it("reports every required failure rather than passing partial state", () => {
    expect(() => evaluateDemoSnapshot({
      health: { ok: false, chainConfigured: false, indexerConfigured: false, markAgeMs: 6_000 }, markets: [], feed: [], vaultAmountE6: 0n,
      keeperLamports: 499_999_999, treasuryLamports: 1_999_999_999, nowMs: now,
    })).toThrow(/backend \/health is not ok[\s\S]*no live BTC 15-minute[\s\S]*SPL vault balance[\s\S]*keeper has less[\s\S]*treasury has less/);
  });
});
