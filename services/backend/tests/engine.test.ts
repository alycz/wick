import activeFixture from "../../../packages/gemini/fixtures/active-btc.json" with { type: "json" };
import { geminiContractSchema, geminiEventsResponseSchema, type GeminiEvent, type GeminiEventsResponse, type GeminiStrike } from "@wick/gemini";
import type { VolSource } from "@wick/vol";
import { describe, expect, it } from "vitest";
import { historyPoint, upDownHistoryQuote } from "../src/pricer/up-down-history.js";
import { PricerEngine } from "../src/pricer/engine.js";
import { replayTheo, type MarketTheoInput } from "../src/pricer/theo-replay.js";
import type {
  BackendLogger,
  ChainPort,
  CreateMarketRequest,
  GeminiGateway,
  MarkUpdateRequest,
  OpenPositionRef,
  QuoteStreamFactory,
  SettlementMarketRef,
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
  active: GeminiEventsResponse = structuredClone(fixture);
  async listEvents(): Promise<GeminiEventsResponse> { return structuredClone(this.active); }
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
  settlementMarkets: SettlementMarketRef[] = [];
  settledPositionSymbols: string[] = [];
  claimCalls = 0;
  failMarks = false;
  failSettlePositions = false;
  configured(): boolean { return true; }
  async marketExists(): Promise<boolean> { return false; }
  async createMarket(request: CreateMarketRequest): Promise<string> { this.created.push(request); return `create-${this.created.length}`; }
  async updateMarks(requests: readonly MarkUpdateRequest[], options: { priorityFeeMicroLamports: number }): Promise<string> {
    if (this.failMarks) throw new Error("mark confirmation failed");
    this.marks.push({ requests: structuredClone(requests), priority: options.priorityFeeMicroLamports });
    return `marks-${this.marks.length}`;
  }
  async listOpenPositions(): Promise<readonly OpenPositionRef[]> { return structuredClone(this.positions); }
  async listSettlementMarkets(): Promise<readonly SettlementMarketRef[]> { return structuredClone(this.settlementMarkets); }
  async liquidate(address: string): Promise<string> { this.liquidations.push(address); return `liq-${address}`; }
  async settleMarket(symbol: string, outcome: "yes" | "no", settlementValueE6: bigint): Promise<string> {
    this.settlements.push({ symbol, outcome, value: settlementValueE6 });
    return `settle-${symbol}`;
  }
  async voidMarket(symbol: string): Promise<string> { this.voids.push(symbol); return `void-${symbol}`; }
  async settleOpenPositions(symbol: string): Promise<readonly string[]> {
    this.settledPositionSymbols.push(symbol);
    if (this.failSettlePositions) throw new Error("position crank failed");
    return ["position-settled"];
  }
  async claimQueue(): Promise<readonly string[]> { this.claimCalls += 1; return ["claim-paid"]; }
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
    // Marks are split so each transaction stays under Solana's size limit.
    const firstRound = chain.marks.length;
    expect(firstRound).toBe(Math.ceil(markets.length / 16));
    expect(chain.marks.every((mark) => mark.requests.length <= 16)).toBe(true);
    expect(new Set(chain.marks.flatMap((mark) => mark.requests.map((request) => request.symbol))).size).toBe(markets.length);

    // Nothing moved and the heartbeat has not elapsed: no new transactions.
    await engine.markOnce();
    expect(chain.marks).toHaveLength(firstRound);
    // Past the heartbeat every open market is re-posted, so none ages past
    // the program's staleness window even when its price is flat.
    now += 2_001;
    await engine.markOnce();
    expect(chain.marks).toHaveLength(firstRound * 2);
    expect(new Set(chain.marks.slice(firstRound).flatMap((mark) => mark.requests.map((request) => request.symbol))).size).toBe(markets.length);
    await engine.stop();
  });

  it("exposes the exact contract when its price is unavailable and clears it on recovery", async () => {
    const now = Date.parse("2026-11-16T22:50:00.000Z");
    const contract = fixture.data[0]!.contracts[0]!;
    const strike = Number(contract.strike.value!);
    const source = new FixedVol(() => now);
    let failed = true;
    source.vol = (_expiry?: number, target?: number) => {
      if (failed && target === strike) throw new Error("missing volatility");
      return .5;
    };
    const engine = new PricerEngine({
      gemini: new FixtureGemini(), vol: source, chain: new RecordingChain(), logger: quietLogger,
      now: () => now, timers: false,
    });
    try {
      await engine.start();
      expect(engine.snapshot().unpricedMarkets).toContainEqual({
        symbol: contract.instrumentSymbol, eventTicker: fixture.data[0]!.ticker, strike, expiryTs: Date.parse(fixture.data[0]!.expiryDate),
      });
      expect(engine.store.market(contract.instrumentSymbol)).toBeUndefined();
      failed = false;
      await engine.markOnce();
      expect(engine.snapshot().unpricedMarkets).toEqual([]);
      expect(engine.store.market(contract.instrumentSymbol)).toBeDefined();
    } finally { await engine.stop(); }
  });

  it("drops crossed historical quotes while preserving the fair-price observation", () => {
    const point = { ts: 123, spot: 63000, theo: .04 };
    expect(upDownHistoryQuote({ ts: 123, bid: .5, ask: .03 }, 123)).toEqual({});
    expect(historyPoint({ ...point, geminiBid: .5, geminiAsk: .03, geminiMid: .265 })).toEqual(point);
    expect(historyPoint({ ...point, geminiBid: null, geminiAsk: .03, geminiMid: null }))
      .toEqual({ ...point, geminiAsk: .03 });
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

  it("records replayable inputs for every listed contract once per minute", async () => {
    let now = Date.parse("2026-11-16T22:50:00.000Z");
    class SkewedVol extends FixedVol {
      override vol(_expiry = 0, strike = 65_500) { return .3 + strike / 400_000; }
    }
    const batches: MarketTheoInput[][] = [];
    const engine = new PricerEngine({
      gemini: new FixtureGemini(), vol: new SkewedVol(() => now), chain: new RecordingChain(),
      logger: quietLogger, now: () => now, timers: false,
      onTheoInputs: (_pricedAt, inputs) => { batches.push(inputs); },
    });
    try {
      await engine.start();
      const markets = engine.store.markets().filter((market) => market.status === "open");
      expect(batches).toHaveLength(1);
      const captured = batches[0]!;
      expect(captured.map((input) => input.symbol).sort()).toEqual(markets.map((market) => market.symbol).sort());
      expect(new Set(captured.map((input) => input.model))).toEqual(new Set(["up_down_v1", "ladder_v1"]));
      for (const input of captured) {
        expect(replayTheo(input)).toBe(input.theo);
        if (input.model === "ladder_v1") expect(input.lowerVolatility).toBeLessThan(input.upperVolatility);
      }
      await engine.markOnce();
      expect(batches).toHaveLength(1);
      now += 60_000;
      await engine.markOnce();
      expect(batches).toHaveLength(2);
    } finally { await engine.stop(); }
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

  it("retains an expired market when active discovery drops it before Gemini resolves", async () => {
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
    settled.contracts.find((item) => item.instrumentSymbol === market.symbol)!.resolutionSide = "yes";
    gemini.settled.set(settled.ticker, settled);
    gemini.active = { ...structuredClone(fixture), data: [], pagination: { ...fixture.pagination, total: 0 } };
    now = Date.parse(settled.expiryDate) + 10_000;

    await engine.discoverOnce();
    await engine.settleOnce();

    expect(chain.settlements).toContainEqual({ symbol: market.symbol, outcome: "yes", value: 65_555_250_000n });
    await engine.stop();
  });

  it("retries only position and queue cranks after the market outcome is confirmed", async () => {
    let now = Date.parse("2026-11-16T22:50:00.000Z");
    const gemini = new FixtureGemini();
    const chain = new RecordingChain();
    const engine = new PricerEngine({
      gemini, vol: new FixedVol(() => now), chain, logger: quietLogger,
      quoteStreamFactory: noSocket, now: () => now, timers: false,
    });
    await engine.start();
    const market = engine.store.markets().find((item) => item.duration === "15m")!;
    const settled = structuredClone(fixture.data.find((item) => item.ticker === market.eventTicker)!);
    settled.status = "settled";
    settled.settlement = { value: "65555.25" };
    settled.contracts.find((item) => item.instrumentSymbol === market.symbol)!.resolutionSide = "yes";
    gemini.settled.set(settled.ticker, settled);
    now = Date.parse(settled.expiryDate) + 10_000;
    chain.failSettlePositions = true;

    await engine.settleOnce();
    chain.failSettlePositions = false;
    await engine.settleOnce();

    expect(chain.settlements.filter((item) => item.symbol === market.symbol)).toHaveLength(1);
    expect(chain.settledPositionSymbols.filter((symbol) => symbol === market.symbol)).toHaveLength(2);
    expect(chain.claimCalls).toBeGreaterThan(0);
    await engine.stop();
  });

  it("recovers a confirmed settlement from chain state after a process restart", async () => {
    const active = fixture.data.find((item) => item.contracts.some((contract) => contract.instrumentSymbol.startsWith("GEMI-")))!;
    const symbol = active.contracts[0]!.instrumentSymbol;
    const now = Date.parse(active.expiryDate) + 10_000;
    const gemini = new FixtureGemini();
    gemini.active = { ...structuredClone(fixture), data: [], pagination: { ...fixture.pagination, total: 0 } };
    const chain = new RecordingChain();
    chain.settlementMarkets = [{ symbol, expiryTs: Math.floor(Date.parse(active.expiryDate) / 1_000), status: "settled" }];
    const engine = new PricerEngine({
      gemini, vol: new FixedVol(() => now), chain, logger: quietLogger,
      quoteStreamFactory: noSocket, now: () => now, timers: false,
    });

    await engine.start();
    await engine.settleOnce();

    expect(chain.settlements).toHaveLength(0);
    expect(chain.settledPositionSymbols).toEqual([symbol]);
    expect(chain.claimCalls).toBe(1);
    await engine.stop();
  });

  it("reports only confirmed on-chain mark batches as fresh", async () => {
    let now = Date.parse("2026-11-16T22:50:00.000Z");
    const chain = new RecordingChain();
    chain.failMarks = true;
    const engine = new PricerEngine({
      gemini: new FixtureGemini(), vol: new FixedVol(() => now), chain, logger: quietLogger,
      quoteStreamFactory: noSocket, now: () => now, timers: false,
    });

    await engine.start();
    expect(engine.snapshot().lastMarkAt).toBeUndefined();
    chain.failMarks = false;
    now += 1_000;
    await engine.markOnce();
    expect(engine.snapshot().lastMarkAt).toBe(now);
    await engine.stop();
  });
});
