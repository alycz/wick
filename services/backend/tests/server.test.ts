import activeFixture from "../../../packages/gemini/fixtures/active-btc.json" with { type: "json" };
import { geminiEventsResponseSchema, type GeminiEvent, type GeminiEventsResponse, type GeminiStrike } from "@wick/gemini";
import type { VolSource } from "@wick/vol";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { PricerEngine } from "../src/pricer/engine.js";
import { UnconfiguredChainPort } from "../src/pricer/chain.js";
import type { BackendLogger, GeminiGateway } from "../src/pricer/types.js";
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
    expect(server.printRoutes()).toContain("stream");
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
});
