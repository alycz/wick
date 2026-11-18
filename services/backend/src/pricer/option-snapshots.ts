import type { PricerMarket } from "@wick/shared";
import type { DeribitOptionQuote, DeribitOptionSnapshot } from "@wick/vol";

export function selectOptionSnapshots(snapshot: DeribitOptionSnapshot, markets: readonly PricerMarket[]): DeribitOptionQuote[] {
  const targets = new Map<number, number>();
  for (const market of markets) {
    if (market.status !== "open" || market.openTs > snapshot.capturedAt || market.expiryTs <= snapshot.capturedAt) continue;
    const previous = targets.get(market.expiryTs);
    if (previous === undefined || Math.abs(market.strike - snapshot.spot) < Math.abs(previous - snapshot.spot)) {
      targets.set(market.expiryTs, market.strike);
    }
  }
  if (!targets.size) targets.set(snapshot.capturedAt, snapshot.spot);

  const chains = new Map<number, DeribitOptionQuote[]>();
  for (const quote of snapshot.quotes) {
    if (quote.expiryMs <= snapshot.capturedAt) continue;
    const chain = chains.get(quote.expiryMs) ?? [];
    chain.push(quote);
    chains.set(quote.expiryMs, chain);
  }
  const expiries = [...chains.keys()].sort((left, right) => left - right);
  const selected = new Map<string, DeribitOptionQuote>();
  for (const [targetExpiry, strike] of targets) {
    const rightIndex = expiries.findIndex((expiry) => expiry >= targetExpiry);
    const left = rightIndex === -1 ? expiries.at(-1) : expiries[rightIndex - 1];
    const right = expiries[rightIndex];
    for (const expiry of [left, right]) {
      if (expiry === undefined) continue;
      const quotes = chains.get(expiry)!;
      for (const type of ["call", "put"] as const) {
        let below: DeribitOptionQuote | undefined;
        let above: DeribitOptionQuote | undefined;
        for (const quote of quotes) {
          if (quote.optionType !== type) continue;
          if (quote.strike < strike && (!below || quote.strike > below.strike)) below = quote;
          if (quote.strike >= strike && (!above || quote.strike < above.strike)) above = quote;
        }
        if (below) selected.set(below.instrumentName, below);
        if (above) selected.set(above.instrumentName, above);
      }
    }
  }
  return [...selected.values()];
}
