import { describe, expect, it } from "vitest";
import { DeribitVolSource } from "../src/deribit.js";
import { DeriveVolSource } from "../src/derive.js";
import { RealizedVolSource } from "../src/realized.js";
import type { FetchLike } from "../src/types.js";

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

describe("live provider parsers", () => {
  it("builds a Deribit surface from mark IV percentages", async () => {
    const now = Date.UTC(2026, 10, 16);
    const expiry = now + 24 * 60 * 60_000;
    const fetchImpl: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes("get_index_price")) return jsonResponse({ result: { index_price: 65_000 } });
      if (url.includes("get_instruments")) return jsonResponse({ result: [
        { instrument_name: "BTC-X-60000-C", expiration_timestamp: expiry, strike: 60_000, option_type: "call" },
        { instrument_name: "BTC-X-65000-C", expiration_timestamp: expiry, strike: 65_000, option_type: "call" },
        { instrument_name: "BTC-X-70000-C", expiration_timestamp: expiry, strike: 70_000, option_type: "call" },
      ] });
      return jsonResponse({ result: [
        { instrument_name: "BTC-X-60000-C", mark_iv: 55, underlying_price: 65_000 },
        { instrument_name: "BTC-X-65000-C", mark_iv: 50, underlying_price: 65_000 },
        { instrument_name: "BTC-X-70000-C", mark_iv: 52, underlying_price: 65_000 },
      ] });
    };
    const source = new DeribitVolSource({ fetchImpl, now: () => now, websocket: false, timers: false });
    await source.start();
    expect(source.spot().px).toBe(65_000);
    expect(source.vol(expiry, 65_000)).toBeCloseTo(0.5, 8);
    expect(source.healthy()).toBe(true);
  });

  it("parses Derive v3 compact option_pricing fields", async () => {
    const now = Date.UTC(2026, 10, 16);
    const expirySeconds = (now + 24 * 60 * 60_000) / 1_000;
    const fetchImpl: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes("get_all_instruments")) return jsonResponse({ result: { instruments: [
        { instrument_name: "BTC-20261117-60000-C", is_active: true, option_details: { expiry: expirySeconds, strike: "60000", option_type: "C" } },
        { instrument_name: "BTC-20261117-65000-C", is_active: true, option_details: { expiry: expirySeconds, strike: "65000", option_type: "C" } },
        { instrument_name: "BTC-20261117-70000-C", is_active: true, option_details: { expiry: expirySeconds, strike: "70000", option_type: "C" } },
      ] } });
      return jsonResponse({ result: { tickers: {
        "BTC-20261117-60000-C": { t: now, I: "65000", option_pricing: { i: "0.55", bi: "0.54", ai: "0.56", f: "65000" } },
        "BTC-20261117-65000-C": { t: now, I: "65000", option_pricing: { i: "0.50", bi: "0.49", ai: "0.51", f: "65000" } },
        "BTC-20261117-70000-C": { t: now, I: "65000", option_pricing: { i: "0.52", bi: "0.51", ai: "0.53", f: "65000" } },
      } } });
    };
    const source = new DeriveVolSource({ fetchImpl, now: () => now, timers: false });
    await source.start();
    expect(source.spot().px).toBe(65_000);
    expect(source.vol(expirySeconds * 1_000, 65_000)).toBeCloseTo(0.5, 8);
    expect(source.healthy()).toBe(true);
  });
});

describe("RealizedVolSource", () => {
  it("annualizes a one-second EWMA and reports staleness", () => {
    let now = 0;
    const source = new RealizedVolSource({ now: () => now, minSamples: 3 });
    for (const px of [65_000, 65_010, 64_995, 65_020, 65_005]) {
      now += 1_000;
      source.observeSpot(px, now);
    }
    expect(source.sampleCount()).toBe(4);
    expect(source.vol(now + 60_000, 65_000)).toBeGreaterThan(0);
    expect(source.healthy()).toBe(true);
    now += 6_000;
    expect(source.healthy()).toBe(false);
  });
});
