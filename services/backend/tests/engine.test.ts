import activeFixture from "../../../packages/gemini/fixtures/active-btc.json" with { type: "json" };
import { geminiContractSchema, geminiEventsResponseSchema, type GeminiEvent, type GeminiEventsResponse, type GeminiStrike } from "@wick/gemini";
import type { VolSource } from "@wick/vol";
import { describe, expect, it } from "vitest";
import { PricerEngine } from "../src/pricer/engine.js";
import type {
  BackendLogger,
  ChainPort,
  CreateMarketRequest,
  GeminiGateway,
  MarkUpdateRequest,
  OpenPositionRef,
  QuoteStreamFactory,
} from "../src/pricer/types.js";

const fixture = geminiEventsResponseSchema.parse(activeFixture);
const quietLogger: BackendLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

class FixedVol implements VolSource {
  readonly name = "deribit" as const;
  started = false;
  constructor(private readonly now: () => number) {}
  async start(): Promise<void> { this.started = true; }
  async stop(): Promise<void> { this.started = false; }
  spot() { return { px: 65_500, ts: this.now() }; }
  vol() { return 0.5; }
  healthy() { return this.started; }
}

class FixtureGemini implements GeminiGateway {
  settled = new Map<string, GeminiEvent>();
  async listEvents(): Promise<GeminiEventsResponse> { return structuredClone(fixture); }
  async getStrike(eventTicker: string): Promise<GeminiStrike> {
    const event = fixture.data.find((item) => item.ticker === eventTicker);
    if (!event) throw new Error("missing fixture event");
    return structuredClone(event.contracts[0]!.strike);
  }
  async getEvent(eventTicker: string): Promise<GeminiEvent> {
    const event = this.settled.get(eventTicker) ?? fixture.data.find((item) => item.ticker === eventTicker);
    if (!event) throw new Error("missing fixture event");
    return structuredClone(event);
  }
}

class RecordingChain implements ChainPort {
  created: CreateMarketRequest[] = [];
  marks: Array<{ requests: readonly MarkUpdateRequest[]; priority: number }> = [];
  liquidations: string[] = [];
  settlements: Array<{ symbol: string; outcome: "yes" | "no"; value: bigint }> = [];
  voids: string[] = [];
  positions: OpenPositionRef[] = [];
  configured(): boolean { return true; }
  async marketExists(): Promise<boolean> { return false; }
  async createMarket(request: CreateMarketRequest): Promise<string> { this.created.push(request); return `create-${this.created.length}`; }
  async updateMarks(requests: readonly MarkUpdateRequest[], options: { priorityFeeMicroLamports: number }): Promise<string> {
    this.marks.push({ requests: structuredClone(requests), priority: options.priorityFeeMicroLamports });
    return `marks-${this.marks.length}`;
  }
  async listOpenPositions(): Promise<readonly OpenPositionRef[]> { return structuredClone(this.positions); }
  async liquidate(address: string): Promise<string> { this.liquidations.push(address); return `liq-${address}`; }
  async settleMarket(symbol: string, outcome: "yes" | "no", settlementValueE6: bigint): Promise<string> {
    this.settlements.push({ symbol, outcome, value: settlementValueE6 });
    return `settle-${symbol}`;
  }
  async voidMarket(symbol: string): Promise<string> { this.voids.push(symbol); return `void-${symbol}`; }
  async settleOpenPositions(): Promise<readonly string[]> { return ["position-settled"]; }
  async claimQueue(): Promise<readonly string[]> { return ["claim-paid"]; }
}

const noSocket: QuoteStreamFactory = () => ({ start: () => undefined, stop: () => undefined });

describe("PricerEngine", () => {
  it("accepts Gemini's live post_only market state", () => {
    const contract = structuredClone(fixture.data[0]!.contracts[0]!);
    contract.marketState = "post_only";
    expect(geminiContractSchema.parse(contract).marketState).toBe("post_only");
  });

  it("discovers real-fixture BTC markets, creates known-strike markets and posts adaptive batches", async () => {
    let now = Date.parse("2026-11-16T22:50:00.000Z");
    const chain = new RecordingChain();
    const engine = new PricerEngine({
      gemini: new FixtureGemini(),
      vol: new FixedVol(() => now),
      chain,
      logger: quietLogger,
      quoteStreamFactory: noSocket,
      now: () => now,
      timers: false,
    });
    await engine.start();
    const markets = engine.store.markets();
    expect(markets.some((market) => market.duration === "15m")).toBe(true);
    expect(markets.some((market) => market.kind === "ladder")).toBe(true);
    expect(markets.every((market) => market.volSource === "deribit" && market.spot === 65_500)).toBe(true);
    expect(chain.created.length).toBe(markets.length);
    expect(chain.marks).toHaveLength(1);
    expect(chain.marks[0]!.requests).toHaveLength(markets.length);

    await engine.markOnce();
    expect(chain.marks).toHaveLength(1);
    now += 4_001;
    await engine.markOnce();
    expect(chain.marks).toHaveLength(2);
    await engine.stop();
  });

  it("liquidates exactly when the side mark is at or below the stored threshold", async () => {
    const now = Date.parse("2026-11-16T22:50:00.000Z");
    const chain = new RecordingChain();
    const engine = new PricerEngine({
      gemini: new FixtureGemini(), vol: new FixedVol(() => now), chain, logger: quietLogger,
      quoteStreamFactory: noSocket, now: () => now, timers: false,
    });
    await engine.start();
    const market = engine.store.markets()[0]!;
    chain.positions = [
      { address: "must-liquidate", symbol: market.symbol, side: "yes", liqMarkE6: 990_000 },
      { address: "safe", symbol: market.symbol, side: "yes", liqMarkE6: 10_000 },
    ];
    await engine.markOnce();
    expect(chain.liquidations).toContain("must-liquidate");
    expect(chain.liquidations).not.toContain("safe");
    await engine.stop();
  });

  it("uses Gemini resolutionSide and official settlement value after expiry", async () => {
    let now = Date.parse("2026-11-16T22:50:00.000Z");
    const gemini = new FixtureGemini();
    const chain = new RecordingChain();
    const engine = new PricerEngine({
      gemini, vol: new FixedVol(() => now), chain, logger: quietLogger,
      quoteStreamFactory: noSocket, now: () => now, timers: false,
    });
    await engine.start();
    const market = engine.store.markets().find((item) => item.duration === "15m")!;
    const active = fixture.data.find((item) => item.ticker === market.eventTicker)!;
    const settled = structuredClone(active);
    settled.status = "settled";
    settled.settlement = { value: "65555.25" };
    const contract = settled.contracts.find((item) => item.instrumentSymbol === market.symbol)!;
    contract.resolutionSide = "yes";
    gemini.settled.set(settled.ticker, settled);
    now = Date.parse(settled.expiryDate) + 10_000;
    await engine.settleOnce();
    expect(chain.settlements).toEqual([{ symbol: market.symbol, outcome: "yes", value: 65_555_250_000n }]);
    await engine.stop();
  });
});
