import type { MarketHistoryPoint, PricerMarket } from "@wick/shared";
import { upDownHistoryQuote, type UpDownHistory } from "./up-down-history.js";

export class MarketStore {
  private readonly current = new Map<string, PricerMarket>();
  private readonly history = new Map<string, MarketHistoryPoint[]>();

  constructor(private readonly historyWindowMs = 30 * 60_000, readonly upDownHistory?: UpDownHistory) {}

  replace(markets: readonly PricerMarket[], now = Date.now()): void {
    const symbols = new Set(markets.map((market) => market.symbol));
    for (const symbol of this.current.keys()) if (!symbols.has(symbol)) this.current.delete(symbol);
    for (const market of markets) {
      this.current.set(market.symbol, structuredClone(market));
      this.appendHistory(market, now);
    }
  }

  updateQuote(symbol: string, quote: PricerMarket["gemini"]): void {
    const market = this.current.get(symbol);
    if (!market || quote.ts < market.gemini.ts) return;
    const { edge: oldEdge, ...current } = market;
    const edge = quote.mid === undefined ? undefined : market.theo - quote.mid;
    this.current.set(symbol, {
      ...current,
      gemini: { ...quote },
      ...(edge === undefined ? {} : { edge }),
    });
  }

  markets(): PricerMarket[] {
    return [...this.current.values()]
      .map((market) => structuredClone(market))
      .sort((left, right) => left.expiryTs - right.expiryTs || left.strike - right.strike);
  }

  market(symbol: string): PricerMarket | undefined {
    const market = this.current.get(symbol);
    return market ? structuredClone(market) : undefined;
  }

  marketHistory(symbol: string, now = Date.now()): MarketHistoryPoint[] {
    const archived = this.upDownHistory?.prices(symbol, now) ?? [];
    const market = this.current.get(symbol);
    if (!market) return archived;
    this.prune(symbol, now);
    const points = new Map(archived.map((point) => [point.ts, point]));
    for (const point of this.history.get(symbol) ?? []) {
      if (market.kind === "up_down" && (point.ts < market.openTs || point.ts >= market.expiryTs)) continue;
      if (!points.has(point.ts)) points.set(point.ts, { ...point });
    }
    return [...points.values()].sort((left, right) => left.ts - right.ts);
  }

  private appendHistory(market: PricerMarket, now: number): void {
    const points = this.history.get(market.symbol) ?? [];
    const point: MarketHistoryPoint = {
      ts: now,
      theo: market.theo,
      spot: market.spot,
      ...upDownHistoryQuote(market.gemini, now),
    };
    const previous = points.at(-1);
    if (!previous || previous.theo !== point.theo || previous.spot !== point.spot || previous.geminiMid !== point.geminiMid
      || previous.geminiBid !== point.geminiBid || previous.geminiAsk !== point.geminiAsk) {
      points.push(point);
    }
    this.history.set(market.symbol, points);
    this.prune(market.symbol, now);
  }

  private prune(symbol: string, now: number): void {
    const points = this.history.get(symbol);
    if (!points) return;
    const cutoff = now - this.historyWindowMs;
    const firstLive = points.findIndex((point) => point.ts >= cutoff);
    if (firstLive > 0) points.splice(0, firstLive);
    else if (firstLive === -1) points.splice(0, points.length);
  }
}
