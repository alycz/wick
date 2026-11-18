import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import activeFixture from "../../../packages/gemini/fixtures/active-btc.json" with { type: "json" };
import { geminiEventsResponseSchema, type GeminiEvent, type GeminiEventsResponse, type GeminiStrike } from "@wick/gemini";
import type { PricerMarket } from "@wick/shared";
import type { VolSource } from "@wick/vol";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { PricerEngine } from "../src/pricer/engine.js";
import { UnconfiguredChainPort } from "../src/pricer/chain.js";
import { MarketStore } from "../src/pricer/store.js";
import { UpDownHistory } from "../src/pricer/up-down-history.js";
import type { BackendLogger, GeminiGateway } from "../src/pricer/types.js";
import { openWickDatabase } from "../src/indexer/database.js";
import { buildServer } from "../src/server.js";

const fixture = geminiEventsResponseSchema.parse(activeFixture);
const now = Date.parse("2026-11-16T22:50:00.000Z");
const logger = pino({ level: "silent" });
const backendLogger: BackendLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

class Gateway implements GeminiGateway {
  async listEvents(): Promise<GeminiEventsResponse> { return structuredClone(fixture); }
  async getStrike(ticker: string): Promise<GeminiStrike> {
    return structuredClone(fixture.data.find((event) => event.ticker === ticker)!.contracts[0]!.strike);
  }
  async getEvent(ticker: string): Promise<GeminiEvent> {
    return structuredClone(fixture.data.find((event) => event.ticker === ticker)!);
  }
}

class Vol implements VolSource {
  readonly name = "deribit" as const;
  live = false;
  async start() { this.live = true; }
  async stop() { this.live = false; }
  spot() { return { px: 65_500, ts: now }; }
  vol() { return 0.5; }
  healthy() { return this.live; }
}

describe("shared Fastify server", () => {
  it("serves markets, 30-minute history and transparent chain health", async () => {
    const engine = new PricerEngine({
      gemini: new Gateway(), vol: new Vol(), chain: new UnconfiguredChainPort(),
      logger: backendLogger, now: () => now, timers: false,
      // The fixture clock is intentionally fixed. Keep route-history assertions
      // independent of the wall clock at which the suite is run.
      store: new MarketStore(Number.MAX_SAFE_INTEGER),
    });
    const server = await buildServer({ engine, logger, telemetryIntervalMs: 60_000 });
    await server.ready();
    for (let attempt = 0; attempt < 20 && engine.store.markets().length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    const marketsResponse = await server.inject({ method: "GET", url: "/markets" });
    expect(marketsResponse.statusCode).toBe(200);
    const markets = marketsResponse.json<Array<{ symbol: string }>>();
    expect(markets.length).toBeGreaterThan(0);

    const history = await server.inject({ method: "GET", url: `/markets/${encodeURIComponent(markets[0]!.symbol)}/history` });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toHaveLength(1);

    const health = await server.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      ok: true,
      cluster: "devnet",
      volSource: "deribit",
      volHealthy: true,
      chainConfigured: false,
    });
    let readFrame!: (frame: string) => void;
    const frame = new Promise<string>((resolve) => { readFrame = resolve; });
    const stream = await server.injectWS("/stream", {}, {
      onInit(socket) { socket.once("message", (data: Buffer) => readFrame(data.toString())); },
    });
    try {
      expect(JSON.parse(await frame)).toMatchObject({ type: "markets", ts: now });
    } finally { stream.terminate(); }
    await server.close();
    expect(engine.running()).toBe(false);
  });

  it("returns a readable 404 for unknown history", async () => {
    const engine = new PricerEngine({
      gemini: new Gateway(), vol: new Vol(), chain: new UnconfiguredChainPort(),
      logger: backendLogger, now: () => now, timers: false,
    });
    const server = await buildServer({ engine, logger });
    const response = await server.inject({ method: "GET", url: "/markets/unknown/history" });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: "MARKET_NOT_FOUND", message: "Unknown Gemini market symbol" });
    await server.close();
  });

  it("serves hosted history for an expired contract absent from local storage", async () => {
    const market = { symbol: "HOSTED-BTC15M", duration: "15m", strike: 65_000, openTs: now - 900_000, expiryTs: now };
    const history = [{ ts: market.openTs + 5_000, theo: .56, spot: 65_005, geminiMid: .55 }];
    const ladder = { symbol: "HOSTED-DAILY-65000", strike: 65_000, expiryTs: now };
    const ladderHistory = [{ ts: now - 60_000, theo: .45, spot: 64_990, geminiAsk: .52 }];
    const engine = new PricerEngine({
      gemini: new Gateway(), vol: new Vol(), chain: new UnconfiguredChainPort(),
      logger: backendLogger, now: () => now, timers: false,
    });
    const server = await buildServer({
      engine, logger,
      hostedMarketData: {
        expiredContracts: async () => [market],
        prices: async (symbol) => symbol === market.symbol ? history : [],
        hasUpDownContract: async (symbol) => symbol === "KNOWN-NO-RECONSTRUCTION",
        expiredLadderContracts: async () => [ladder],
        ladderPrices: async (symbol) => symbol === ladder.symbol ? ladderHistory : [],
        lastSync: () => now,
      },
    });
    try {
      expect((await server.inject("/markets/up-down-history")).json()).toEqual([market]);
      expect((await server.inject(`/markets/${market.symbol}/history`)).json()).toEqual(history);
      const empty = await server.inject("/markets/KNOWN-NO-RECONSTRUCTION/history");
      expect(empty.statusCode).toBe(200);
      expect(empty.json()).toEqual([]);
      expect((await server.inject("/markets/ladder-history")).json()).toEqual([ladder]);
      expect((await server.inject(`/markets/${ladder.symbol}/history`)).json()).toEqual(ladderHistory);
    } finally { await server.close(); }
  });

  it("serves recorded Up/Down prices after expiry and a database restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "wick-up-down-"));
    const path = join(directory, "wick.db");
    const openedAt = Math.floor(Date.now() / 5_000) * 5_000 - 20 * 60_000;
    const market: PricerMarket = {
      symbol: "BTC-15M-UP", eventTicker: "BTC15M", kind: "up_down", duration: "15m",
      title: "BTC Up/Down", strike: 65_000, openTs: openedAt, expiryTs: openedAt + 15 * 60_000,
      spot: 65_100, theo: .6, gemini: { ask: .57, ts: openedAt }, maxLeverage: 4,
      status: "open", volSource: "deribit",
    };
    try {
      const initial = openWickDatabase(path);
      try {
        const archive = new UpDownHistory(initial);
        const upcoming = { ...market, symbol: "FUTURE", openTs: Date.now() + 60_000, expiryTs: Date.now() + 120_000 };
        archive.record([market, upcoming, { ...market, symbol: "LADDER", kind: "ladder" }], openedAt);
        archive.record([{ ...market, theo: .62 }], openedAt + 1_000);
        archive.record([{ ...market, theo: .65, gemini: { bid: .58, ts: openedAt - 60_000 } }], openedAt + 5_000);
        archive.record([{ ...market, theo: .99 }], market.expiryTs);
      } finally {
        initial.close();
      }

      const restarted = openWickDatabase(path);
      try {
        const gateway = new Gateway();
        gateway.listEvents = async () => ({ data: [], pagination: { limit: 500, offset: 0, total: 0 } });
        const engine = new PricerEngine({
          gemini: gateway, vol: new Vol(), chain: new UnconfiguredChainPort(),
          logger: backendLogger, now: () => now, timers: false,
          store: new MarketStore(undefined, new UpDownHistory(restarted)),
        });
        const server = await buildServer({ engine, logger });
        try {
          const contracts = await server.inject({ method: "GET", url: "/markets/up-down-history" });
          expect(contracts.statusCode).toBe(200);
          expect(contracts.json()).toEqual([{
            symbol: market.symbol, duration: market.duration, strike: market.strike,
            openTs: openedAt, expiryTs: market.expiryTs,
          }]);
          const prices = await server.inject({ method: "GET", url: `/markets/${market.symbol}/history` });
          expect(prices.statusCode).toBe(200);
          expect(prices.json()).toEqual([
            { ts: openedAt, theo: .6, spot: 65_100, geminiAsk: .57 },
            { ts: openedAt + 5_000, theo: .65, spot: 65_100 },
          ]);
        } finally {
          await server.close();
        }
      } finally {
        restarted.close();
      }
    } finally {
      rmSync(directory, { recursive: true });
    }
  });

  it("allows only configured browser origins without enabling credentials", async () => {
    const engine = new PricerEngine({
      gemini: new Gateway(), vol: new Vol(), chain: new UnconfiguredChainPort(),
      logger: backendLogger, now: () => now, timers: false,
    });
    const server = await buildServer({
      engine, logger, allowedOrigins: ["https://wick-markets.vercel.app"], allowLocalhostOrigins: false,
    });
    const allowed = await server.inject({ method: "GET", url: "/health", headers: { origin: "https://wick-markets.vercel.app" } });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://wick-markets.vercel.app");
    expect(allowed.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(allowed.headers.vary).toBe("Origin");

    const preflight = await server.inject({ method: "OPTIONS", url: "/markets", headers: { origin: "https://wick-markets.vercel.app" } });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-methods"]).toBe("GET, OPTIONS");

    const denied = await server.inject({ method: "GET", url: "/health", headers: { origin: "https://evil.example" } });
    expect(denied.statusCode).toBe(403);
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    await server.close();
  });

  it("keeps the Streams webhook outside the browser CORS surface", async () => {
    const engine = new PricerEngine({
      gemini: new Gateway(), vol: new Vol(), chain: new UnconfiguredChainPort(),
      logger: backendLogger, now: () => now, timers: false,
    });
    const server = await buildServer({
      engine, logger, allowedOrigins: ["https://wick-markets.vercel.app"], allowLocalhostOrigins: false,
      registerAdditionalRoutes: (instance) => { instance.post("/streams/webhook", async () => ({ accepted: true })); },
    });
    const browser = await server.inject({
      method: "POST", url: "/streams/webhook", headers: { origin: "https://wick-markets.vercel.app" }, payload: {},
    });
    expect(browser.statusCode).toBe(403);
    expect(browser.json()).toEqual({ code: "BROWSER_WEBHOOK_FORBIDDEN", message: "Streams webhook does not accept browser-origin requests" });
    const serverToServer = await server.inject({ method: "POST", url: "/streams/webhook", payload: {} });
    expect(serverToServer.statusCode).toBe(200);
    await server.close();
  });
});
