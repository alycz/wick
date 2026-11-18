import type { GeminiQuote } from "@wick/shared";
import {
  bookTickerMessageSchema,
  contractStatusMessageSchema,
  type GeminiContract,
} from "./schemas.js";

function optionalDecimal(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

interface RawQuote {
  bid: number | undefined;
  ask: number | undefined;
  last: number | undefined;
  ts: number;
}

function normalizeQuote(quote: RawQuote): GeminiQuote {
  const result: GeminiQuote = { ts: quote.ts };
  if (quote.last !== undefined) result.last = quote.last;
  if (quote.bid !== undefined && quote.ask !== undefined && quote.bid > quote.ask) return result;
  if (quote.bid !== undefined) result.bid = quote.bid;
  if (quote.ask !== undefined) result.ask = quote.ask;
  if (quote.bid !== undefined && quote.ask !== undefined) {
    result.mid = (quote.bid + quote.ask) / 2;
  }
  return result;
}

export function quoteFromContract(contract: GeminiContract, ts = Date.now()): GeminiQuote {
  const bid = optionalDecimal(contract.prices.bestBid);
  const ask = optionalDecimal(contract.prices.bestAsk);
  const last = optionalDecimal(contract.prices.lastTradePrice);
  return normalizeQuote({ bid, ask, last, ts });
}

function eventTimestampMs(value: string | number): number {
  try {
    const raw = BigInt(String(value));
    if (raw > 10_000_000_000_000_000n) return Number(raw / 1_000_000n);
    if (raw > 10_000_000_000_000n) return Number(raw / 1_000n);
    return Number(raw);
  } catch {
    return Date.now();
  }
}

export function parseBookTicker(input: unknown): { symbol: string; quote: GeminiQuote } {
  const message = bookTickerMessageSchema.parse(input);
  return {
    symbol: message.s,
    quote: normalizeQuote({
      bid: optionalDecimal(message.b),
      ask: optionalDecimal(message.a),
      last: optionalDecimal(message.c),
      ts: eventTimestampMs(message.E),
    }),
  };
}

export function parseContractStatus(input: unknown) {
  return contractStatusMessageSchema.parse(input);
}
