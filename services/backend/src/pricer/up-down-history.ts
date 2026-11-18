import type { ArchivedUpDownContract, MarketHistoryPoint, PricerMarket } from "@wick/shared";
import type { WickDatabase } from "../indexer/database.js";

// Unnormalized Deribit stream IV affected the first production collector on November 18.
export const SHORT_REPLAY_START = Date.parse("2026-11-18T12:39:00Z");
export const SHORT_REPLAY_END = Date.parse("2026-11-18T21:03:00Z");

const SAMPLE_INTERVAL_MS = 5_000;
export const MARKET_HISTORY_RETENTION_MS = 7 * 24 * 60 * 60_000;
const PRUNE_INTERVAL_MS = 60 * 60_000;

export interface RecordedUpDownPrice {
  contract: ArchivedUpDownContract;
  bucket: number;
  ts: number;
  theo: number;
  spot: number;
  geminiMid: number | null;
  geminiBid?: number | null;
  geminiAsk?: number | null;
}

type QuoteHistory = Pick<MarketHistoryPoint, "geminiBid" | "geminiAsk" | "geminiMid">;
type PriceRow = Omit<MarketHistoryPoint, keyof QuoteHistory> & { [K in keyof QuoteHistory]-?: number | null };

export function upDownHistoryQuote(quote: PricerMarket["gemini"], now: number): QuoteHistory {
  const age = now - quote.ts;
  if (age < -5_000 || age > 30_000) return {};
  return historyQuote(quote.bid, quote.ask, quote.mid);
}

function historyQuote(bid: number | null | undefined, ask: number | null | undefined, mid: number | null | undefined): QuoteHistory {
  const valid = (value: number | null | undefined): value is number => value != null && value >= 0 && value <= 1;
  if (valid(bid) && valid(ask) && bid > ask) return {};
  return {
    ...(valid(bid) ? { geminiBid: bid } : {}),
    ...(valid(ask) ? { geminiAsk: ask } : {}),
    ...(valid(mid) ? { geminiMid: mid } : {}),
  };
}

export function historyPoint({ geminiMid, geminiBid, geminiAsk, ...point }: PriceRow): MarketHistoryPoint {
  return { ...point, ...historyQuote(geminiBid, geminiAsk, geminiMid) };
}

export class UpDownHistory {
  private readonly write;
  private readonly expired;
  private readonly lookup;
  private readonly samples;
  private readonly prune;
  private lastBucket: number | undefined;
  private nextPruneAt = 0;

  constructor(database: WickDatabase, onRecord?: (price: RecordedUpDownPrice) => void) {
    const insertContract = database.prepare(`
      INSERT OR IGNORE INTO up_down_contracts (symbol, duration, strike, open_ts, expiry_ts)
      VALUES (@symbol, @duration, @strike, @openTs, @expiryTs)
    `);
    const insertSample = database.prepare(`
      INSERT OR IGNORE INTO up_down_prices (symbol, bucket, ts, theo, spot, gemini_mid, gemini_bid, gemini_ask)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.write = database.transaction((markets: readonly PricerMarket[], now: number, bucket: number) => {
      for (const market of markets) {
        if (market.kind !== "up_down" || market.status !== "open" || now < market.openTs || now >= market.expiryTs) continue;
        insertContract.run(market);
        const { geminiMid = null, geminiBid = null, geminiAsk = null } = upDownHistoryQuote(market.gemini, now);
        const inserted = insertSample.run(market.symbol, bucket, now, market.theo, market.spot, geminiMid, geminiBid, geminiAsk);
        if (onRecord && inserted.changes) {
          onRecord({
            contract: { symbol: market.symbol, duration: market.duration, strike: market.strike, openTs: market.openTs, expiryTs: market.expiryTs },
            bucket, ts: now, theo: market.theo, spot: market.spot, geminiMid, geminiBid, geminiAsk,
          });
        }
      }
    });
    this.expired = database.prepare<[number, number], ArchivedUpDownContract>(`
      SELECT symbol, duration, strike, open_ts AS openTs, expiry_ts AS expiryTs
      FROM up_down_contracts WHERE expiry_ts BETWEEN ? AND ?
      ORDER BY expiry_ts DESC, symbol LIMIT 100
    `);
    this.lookup = database.prepare<[string, number]>("SELECT 1 FROM up_down_contracts WHERE symbol = ? AND expiry_ts >= ?");
    this.samples = database.prepare<[string, number], PriceRow>(`
      SELECT ts, theo, spot, gemini_mid AS geminiMid, gemini_bid AS geminiBid, gemini_ask AS geminiAsk
      FROM up_down_prices JOIN up_down_contracts USING (symbol)
      WHERE symbol = ? AND expiry_ts >= ? AND (ts < ${SHORT_REPLAY_START} OR ts >= ${SHORT_REPLAY_END}) ORDER BY bucket
    `);
    this.prune = database.prepare("DELETE FROM up_down_contracts WHERE expiry_ts < ?");
  }

  record(markets: readonly PricerMarket[], now: number): void {
    const bucket = Math.floor(now / SAMPLE_INTERVAL_MS);
    if (this.lastBucket === bucket) return;
    this.write(markets, now, bucket);
    this.lastBucket = bucket;
    if (now >= this.nextPruneAt) {
      this.prune.run(now - MARKET_HISTORY_RETENTION_MS);
      this.nextPruneAt = now + PRUNE_INTERVAL_MS;
    }
  }

  expiredContracts(now = Date.now()): ArchivedUpDownContract[] {
    return this.expired.all(now - MARKET_HISTORY_RETENTION_MS, now);
  }

  hasContract(symbol: string, now = Date.now()): boolean {
    return this.lookup.get(symbol, now - MARKET_HISTORY_RETENTION_MS) !== undefined;
  }

  prices(symbol: string, now = Date.now()): MarketHistoryPoint[] {
    return this.samples.all(symbol, now - MARKET_HISTORY_RETENTION_MS).map(historyPoint);
  }
}
