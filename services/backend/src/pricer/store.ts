import type { MarketHistoryPoint, PricerMarket } from "@wick/shared";

export class MarketStore {
  private readonly current = new Map<string, PricerMarket>();
  private readonly history = new Map<string, MarketHistoryPoint[]>();

  constructor(private readonly historyWindowMs = 30 * 60_000) {}

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
    if (!market) return;
    const edge = quote.mid === undefined ? undefined : market.theo - quote.mid;
    this.current.set(symbol, {
      ...market,
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
    this.prune(symbol, now);
    return (this.history.get(symbol) ?? []).map((point) => ({ ...point }));
  }

  private appendHistory(market: PricerMarket, now: number): void {
    const points = this.history.get(market.symbol) ?? [];
    const point: MarketHistoryPoint = {
      ts: now,
      theo: market.theo,
      spot: market.spot,
      ...(market.gemini.mid === undefined ? {} : { geminiMid: market.gemini.mid }),
    };
    const previous = points.at(-1);
    if (!previous || previous.theo !== point.theo || previous.spot !== point.spot || previous.geminiMid !== point.geminiMid) {
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
