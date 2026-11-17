import {
  discoverBtcMarkets,
  quoteFromContract,
  type GeminiContract,
  type GeminiEvent,
  type GeminiMarketBucket,
} from "@wick/gemini";
import { ladderTheo, SECONDS_PER_YEAR, twoSidedLeverageCap, upDownTheo } from "@wick/pricing";
import type { GeminiQuote, PricerMarket } from "@wick/shared";
import type { VolSource } from "@wick/vol";
import { MarketStore } from "./store.js";
import { withRetry } from "./retry.js";
import type {
  BackendLogger,
  ChainPort,
  GeminiGateway,
  MarkUpdateRequest,
  PricerSnapshot,
  QuoteStream,
  QuoteStreamFactory,
} from "./types.js";

type SupportedBucket = Exclude<GeminiMarketBucket, "unsupported">;

interface Candidate {
  bucket: SupportedBucket;
  event: GeminiEvent;
  contract: GeminiContract;
  strike: number;
}

interface PendingSettlement {
  symbol: string;
  eventTicker: string;
  expiryMs: number;
  stage: "await_outcome" | "crank";
}

export interface PricerEngineOptions {
  gemini: GeminiGateway;
  vol: VolSource;
  chain: ChainPort;
  logger: BackendLogger;
  store?: MarketStore;
  quoteStreamFactory?: QuoteStreamFactory;
  now?: () => number;
  discoveryIntervalMs?: number;
  markIntervalMs?: number;
  settlementIntervalMs?: number;
  heartbeatMs?: number;
  markMoveE6?: number;
  halfSpreadE6?: number;
  timers?: boolean;
}

const durationByBucket: Record<SupportedBucket, string> = {
  five_minute: "5m",
  fifteen_minute: "15m",
  hourly: "1h",
  daily: "1d",
  weekly: "1w",
  month_end: "month-end",
};

const cutoffByBucket: Record<SupportedBucket, number> = {
  five_minute: 60,
  fifteen_minute: 60,
  hourly: 300,
  daily: 600,
  weekly: 600,
  month_end: 600,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function priceToE6(value: number): number {
  return Math.max(10_000, Math.min(990_000, Math.round(value * 1_000_000)));
}

function settlementToE6(value: string): bigint {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error(`invalid Gemini settlement value ${value}`);
  return BigInt(Math.round(numeric * 1_000_000));
}

export class PricerEngine {
  readonly store: MarketStore;
  private readonly gemini: GeminiGateway;
  private readonly vol: VolSource;
  private readonly chain: ChainPort;
  private readonly logger: BackendLogger;
  private readonly quoteStreamFactory: QuoteStreamFactory | undefined;
  private readonly now: () => number;
  private readonly discoveryIntervalMs: number;
  private readonly markIntervalMs: number;
  private readonly settlementIntervalMs: number;
  private readonly heartbeatMs: number;
  private readonly markMoveE6: number;
  private readonly halfSpreadE6: number;
  private readonly timers: boolean;
  private candidates = new Map<string, Candidate>();
  private quotes = new Map<string, GeminiQuote>();
  private lastPosted = new Map<string, { markE6: number; cap: number; at: number }>();
  private ensuredMarkets = new Set<string>();
  private pendingSettlements = new Map<string, PendingSettlement>();
  private completedSettlements = new Set<string>();
  private quoteStream: QuoteStream | undefined;
  private quoteSymbolsKey = "";
  private intervals: ReturnType<typeof setInterval>[] = [];
  private runningState = false;
  private discovering = false;
  private marking = false;
  private settling = false;
  private priorityFeeMicroLamports = 0;
  private lastBatchAt = 0;
  private lastDiscoveryAt: number | undefined;
  private lastMarkAt: number | undefined;
  private lastError: string | undefined;

  constructor(options: PricerEngineOptions) {
    this.gemini = options.gemini;
    this.vol = options.vol;
    this.chain = options.chain;
    this.logger = options.logger;
    this.store = options.store ?? new MarketStore();
    this.quoteStreamFactory = options.quoteStreamFactory;
    this.now = options.now ?? Date.now;
    this.discoveryIntervalMs = options.discoveryIntervalMs ?? 10_000;
    this.markIntervalMs = options.markIntervalMs ?? 1_000;
    this.settlementIntervalMs = options.settlementIntervalMs ?? 3_000;
    this.heartbeatMs = options.heartbeatMs ?? 4_000;
    this.markMoveE6 = options.markMoveE6 ?? 1_000;
    this.halfSpreadE6 = options.halfSpreadE6 ?? 5_000;
    this.timers = options.timers ?? true;
  }

  running(): boolean { return this.runningState; }
  chainConfigured(): boolean { return this.chain.configured(); }

  snapshot(): PricerSnapshot {
    let volSource: PricerSnapshot["volSource"] = "unavailable";
    try { volSource = this.vol.name; } catch { /* source not selected */ }
    return {
      markets: this.store.markets(),
      volSource,
      volHealthy: this.vol.healthy(),
      chainConfigured: this.chain.configured(),
      running: this.runningState,
      ...(this.lastDiscoveryAt === undefined ? {} : { lastDiscoveryAt: this.lastDiscoveryAt }),
      // `lastMarkAt` is intentionally the last confirmed on-chain batch, not
      // the most recent local pricing attempt. Demo readiness depends on it.
      ...(this.lastMarkAt === undefined ? {} : { lastMarkAt: this.lastMarkAt }),
      ...(this.lastError === undefined ? {} : { lastError: this.lastError }),
    };
  }

  async start(): Promise<void> {
    if (this.runningState) return;
    this.runningState = true;
    try {
      await this.vol.start?.();
      if (!this.runningState) return;
      await this.discoverOnce();
      if (!this.runningState) return;
      await this.markOnce();
    } catch (error) {
      this.recordError("startup", error);
    }
    if (this.timers && this.runningState) {
      this.intervals.push(setInterval(() => void this.discoverOnce(), this.discoveryIntervalMs));
      this.intervals.push(setInterval(() => void this.markOnce(), this.markIntervalMs));
      this.intervals.push(setInterval(() => void this.settleOnce(), this.settlementIntervalMs));
    }
  }

  async stop(): Promise<void> {
    this.runningState = false;
    for (const interval of this.intervals) clearInterval(interval);
    this.intervals = [];
    this.quoteStream?.stop();
    this.quoteStream = undefined;
    await this.vol.stop?.();
    await this.chain.close?.();
  }

  async discoverOnce(): Promise<void> {
    if (this.discovering || !this.runningState) return;
    this.discovering = true;
    try {
      const spot = this.vol.spot().px;
      if (!Number.isFinite(spot) || spot <= 0) throw new Error("vol source has no valid BTC spot");
      const response = await withRetry(
        () => this.gemini.listEvents({ status: "active", search: "BTC", limit: 500, offset: 0 }),
        { attempts: 3, baseDelayMs: 250 },
      );
      const discovered = discoverBtcMarkets(response.data, spot, this.now());
      const next = new Map<string, Candidate>();
      const ensureRequests: Promise<void>[] = [];
      for (const group of discovered) {
        for (const contract of group.contracts) {
          let strikeValue = contract.strike.value;
          if (strikeValue == null && group.event.type === "binary") {
            try { strikeValue = (await this.gemini.getStrike(group.event.ticker)).value; }
            catch (error) {
              this.logger.warn({ eventTicker: group.event.ticker, error: errorMessage(error) }, "Gemini strike is not available yet");
            }
          }
          if (strikeValue == null) continue;
          const strike = Number(strikeValue);
          if (!Number.isFinite(strike) || strike <= 0) continue;
          const candidate: Candidate = { bucket: group.bucket, event: group.event, contract, strike };
          next.set(contract.instrumentSymbol, candidate);
          this.rememberPendingSettlement({
            symbol: contract.instrumentSymbol,
            eventTicker: group.event.ticker,
            expiryMs: Date.parse(group.event.expiryDate),
            stage: "await_outcome",
          });
          this.quotes.set(contract.instrumentSymbol, this.quotes.get(contract.instrumentSymbol) ?? quoteFromContract(contract, this.now()));
          if (this.chain.configured()) ensureRequests.push(this.ensureMarket(candidate));
        }
      }
      this.candidates = next;
      await Promise.all(ensureRequests);
      this.restartQuoteStream([...next.keys()]);
      this.lastDiscoveryAt = this.now();
      this.lastError = undefined;
      this.logger.info({ events: discovered.length, contracts: next.size, spot }, "Gemini market discovery completed");
    } catch (error) {
      this.recordError("discovery", error);
    } finally {
      this.discovering = false;
    }
  }

  async markOnce(): Promise<void> {
    if (this.marking || !this.runningState) return;
    this.marking = true;
    try {
      if (!this.vol.healthy()) {
        this.logger.warn({}, "Vol source unhealthy; skipping marks so on-chain staleness halts trading");
        return;
      }
      const now = this.now();
      const markets: PricerMarket[] = [];
      for (const candidate of this.candidates.values()) {
        try { markets.push(this.priceCandidate(candidate, now)); }
        catch (error) {
          this.logger.warn({ symbol: candidate.contract.instrumentSymbol, error: errorMessage(error) }, "Market pricing failed");
        }
      }
      this.store.replace(markets, now);
      this.lastError = undefined;
      if (this.chain.configured()) {
        await this.postAdaptiveMarks(markets, now);
        await this.runLiquidator(markets);
      }
    } catch (error) {
      this.recordError("mark_loop", error);
    } finally {
      this.marking = false;
    }
  }

  async settleOnce(): Promise<void> {
    if (this.settling || !this.runningState || !this.chain.configured()) return;
    this.settling = true;
    try {
      const now = this.now();
      try { await this.recoverPendingSettlements(); }
      catch (error) {
        this.logger.warn({ error: errorMessage(error) }, "On-chain settlement recovery failed; retrying known pending markets");
      }
      const expired = [...this.pendingSettlements.values()].filter((pending) => pending.expiryMs <= now);
      for (const pending of expired) {
        try {
          if (pending.stage === "await_outcome") {
            const event = await withRetry(() => this.gemini.getEvent(pending.eventTicker), { attempts: 2, baseDelayMs: 250 });
            if (event.status !== "settled" && event.status !== "invalid") continue;
            if (event.status === "invalid") {
              const signature = await this.chain.voidMarket(pending.symbol);
              this.logger.info({ symbol: pending.symbol, signature }, "Invalid Gemini market voided on chain");
            } else {
              const contract = event.contracts.find((item) => item.instrumentSymbol === pending.symbol);
              if (!contract?.resolutionSide) throw new Error("Gemini settlement is missing resolutionSide");
              const settlementValue = event.settlement?.value ?? contract.settlementValue;
              if (settlementValue == null) throw new Error("Gemini settlement is missing official settlement value");
              const signature = await this.chain.settleMarket(pending.symbol, contract.resolutionSide, settlementToE6(settlementValue));
              this.logger.info({ symbol: pending.symbol, outcome: contract.resolutionSide, signature }, "Gemini outcome settled on chain");
            }
            pending.stage = "crank";
          }
          await this.chain.settleOpenPositions(pending.symbol);
          await this.chain.claimQueue();
          this.completedSettlements.add(pending.symbol);
          this.pendingSettlements.delete(pending.symbol);
        } catch (error) {
          this.logger.warn({ symbol: pending.symbol, stage: pending.stage, error: errorMessage(error) }, "Settlement crank failed");
        }
      }
    } finally {
      this.settling = false;
    }
  }

  private priceCandidate(candidate: Candidate, now: number): PricerMarket {
    const expiryMs = Date.parse(candidate.event.expiryDate);
    const timeYears = Math.max((expiryMs - now) / 1_000 / SECONDS_PER_YEAR, 1 / SECONDS_PER_YEAR);
    const spot = this.vol.spot().px;
    const volatility = this.vol.vol(expiryMs, candidate.strike);
    const kind = candidate.event.type === "binary" ? "up_down" : "ladder";
    const theoResult = kind === "up_down"
      ? upDownTheo({ spot, strike: candidate.strike, volatility, timeYears })
      : undefined;
    const theo = theoResult?.probability ?? ladderTheo({
      forward: spot,
      strike: candidate.strike,
      timeYears,
      volAtStrike: (strike) => this.vol.vol(expiryMs, strike),
    });
    const cap = twoSidedLeverageCap({
      probabilitySide: theo,
      volatility,
      timeYears,
      ...(theoResult === undefined ? {} : { d2: theoResult.d2 }),
      globalMax: 1_000,
    });
    const quote = this.quotes.get(candidate.contract.instrumentSymbol) ?? quoteFromContract(candidate.contract, now);
    const edge = quote.mid === undefined ? undefined : theo - quote.mid;
    return {
      symbol: candidate.contract.instrumentSymbol,
      eventTicker: candidate.event.ticker,
      kind,
      duration: durationByBucket[candidate.bucket],
      title: candidate.event.title,
      strike: candidate.strike,
      openTs: Date.parse(candidate.event.startTime),
      expiryTs: expiryMs,
      spot,
      theo,
      gemini: { ...quote },
      ...(edge === undefined ? {} : { edge }),
      maxLeverage: cap,
      status: expiryMs <= now ? "expired" : "open",
      volSource: this.vol.name,
    };
  }

  private async ensureMarket(candidate: Candidate): Promise<void> {
    const symbol = candidate.contract.instrumentSymbol;
    if (this.ensuredMarkets.has(symbol)) return;
    try {
      if (await this.chain.marketExists(symbol)) {
        this.ensuredMarkets.add(symbol);
        return;
      }
      const signature = await this.chain.createMarket({
        symbol,
        kind: candidate.event.type === "binary" ? "up_down" : "ladder",
        strikeUsdE6: BigInt(Math.round(candidate.strike * 1_000_000)),
        openTs: Math.floor(Date.parse(candidate.event.startTime) / 1_000),
        expiryTs: Math.floor(Date.parse(candidate.event.expiryDate) / 1_000),
        cutoffSecs: cutoffByBucket[candidate.bucket],
        halfSpreadE6: this.halfSpreadE6,
      });
      this.ensuredMarkets.add(symbol);
      this.logger.info({ symbol, signature }, "Gemini market created on chain after strike availability");
    } catch (error) {
      this.logger.warn({ symbol, error: errorMessage(error) }, "On-chain market creation failed");
    }
  }

  private restartQuoteStream(symbols: string[]): void {
    if (!this.quoteStreamFactory || symbols.length === 0) return;
    const key = [...symbols].sort().join("|");
    if (key === this.quoteSymbolsKey) return;
    this.quoteStream?.stop();
    this.quoteSymbolsKey = key;
    this.quoteStream = this.quoteStreamFactory({
      symbols,
      onQuote: (symbol, quote) => {
        this.quotes.set(symbol, quote);
        this.store.updateQuote(symbol, quote);
      },
      onStatus: () => void this.discoverOnce(),
    });
    this.quoteStream.start();
  }

  private async postAdaptiveMarks(markets: readonly PricerMarket[], now: number): Promise<void> {
    const open = markets.filter((market) => market.status === "open" && this.ensuredMarkets.has(market.symbol));
    if (open.length === 0) return;
    const heartbeat = now - this.lastBatchAt >= this.heartbeatMs;
    const changed = open.some((market) => {
      const previous = this.lastPosted.get(market.symbol);
      return !previous || Math.abs(priceToE6(market.theo) - previous.markE6) >= this.markMoveE6 || previous.cap !== market.maxLeverage;
    });
    if (!changed && !heartbeat) return;
    const requests: MarkUpdateRequest[] = open.map((market) => ({
      symbol: market.symbol,
      markE6: priceToE6(market.theo),
      maxLeverage: market.maxLeverage,
    }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("mark transaction did not land within 3 seconds")), 3_000);
    try {
      const signature = await this.chain.updateMarks(requests, {
        priorityFeeMicroLamports: this.priorityFeeMicroLamports,
        signal: controller.signal,
      });
      this.lastBatchAt = now;
      this.lastMarkAt = now;
      for (const request of requests) this.lastPosted.set(request.symbol, { markE6: request.markE6, cap: request.maxLeverage, at: now });
      this.priorityFeeMicroLamports = 0;
      this.logger.info({ count: requests.length, signature }, "Adaptive mark batch confirmed");
    } catch (error) {
      this.priorityFeeMicroLamports = 1_000;
      this.logger.warn({ count: requests.length, error: errorMessage(error) }, "Mark batch failed; next attempt will add a small priority fee");
    } finally {
      clearTimeout(timeout);
    }
  }

  private rememberPendingSettlement(pending: PendingSettlement): void {
    if (this.completedSettlements.has(pending.symbol)) return;
    const current = this.pendingSettlements.get(pending.symbol);
    if (!current || (current.stage === "await_outcome" && pending.stage === "crank")) this.pendingSettlements.set(pending.symbol, pending);
  }

  private async recoverPendingSettlements(): Promise<void> {
    const markets = await this.chain.listSettlementMarkets();
    for (const market of markets) {
      if (this.completedSettlements.has(market.symbol)) continue;
      this.rememberPendingSettlement({
        symbol: market.symbol,
        eventTicker: eventTickerFromSymbol(market.symbol),
        expiryMs: market.expiryTs * 1_000,
        stage: market.status === "settled" || market.status === "invalid" ? "crank" : "await_outcome",
      });
    }
  }

  private async runLiquidator(markets: readonly PricerMarket[]): Promise<void> {
    const bySymbol = new Map(markets.map((market) => [market.symbol, market]));
    let positions;
    try { positions = await this.chain.listOpenPositions(); }
    catch (error) {
      this.logger.warn({ error: errorMessage(error) }, "Open-position scan failed");
      return;
    }
    for (const position of positions) {
      const market = bySymbol.get(position.symbol);
      if (!market) continue;
      const sideMark = priceToE6(position.side === "yes" ? market.theo : 1 - market.theo);
      if (sideMark > position.liqMarkE6) continue;
      try {
        const signature = await this.chain.liquidate(position.address);
        this.logger.info({ position: position.address, symbol: position.symbol, signature }, "Position liquidated");
      } catch (error) {
        this.logger.warn({ position: position.address, error: errorMessage(error) }, "Liquidation failed");
      }
    }
  }

  private recordError(operation: string, error: unknown): void {
    this.lastError = `${operation}: ${errorMessage(error)}`;
    this.logger.error({ operation, error: errorMessage(error) }, "Pricer operation failed");
  }
}

function eventTickerFromSymbol(symbol: string): string {
  if (!symbol.startsWith("GEMI-")) throw new Error(`Cannot recover Gemini event ticker from symbol ${symbol}`);
  const withoutPrefix = symbol.slice("GEMI-".length);
  const contractSeparator = withoutPrefix.lastIndexOf("-");
  if (contractSeparator <= 0) throw new Error(`Cannot recover Gemini event ticker from symbol ${symbol}`);
  return withoutPrefix.slice(0, contractSeparator);
}
