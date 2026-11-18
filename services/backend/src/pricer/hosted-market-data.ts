import postgres from "postgres";
import { gzipSync } from "node:zlib";
import type { ArchivedLadderContract, ArchivedUpDownContract, MarketHistoryPoint } from "@wick/shared";
import type { DeribitOptionQuote, DeribitOptionSnapshot } from "@wick/vol";
import type { WickDatabase } from "../indexer/database.js";
import type { BackendLogger } from "./types.js";
import type { MarketTheoInput } from "./theo-replay.js";
import { historyPoint, MARKET_HISTORY_RETENTION_MS, SHORT_REPLAY_START, SHORT_REPLAY_END, type RecordedUpDownPrice } from "./up-down-history.js";

type PendingWrite =
  | { kind: "up_down"; data: RecordedUpDownPrice }
  | { kind: "deribit"; sampledAt: number; quotes: DeribitOptionQuote[]; chain?: PackedChain }
  | { kind: "theo"; pricedAt: number; inputs: MarketTheoInput[] };

interface PackedChain {
  capturedAt: number;
  spot: number;
  optionCount: number;
  base64: string;
}

type Column = string | number | Date | Buffer | null;

const FLUSH_INTERVAL_MS = 5_000;
const PRUNE_INTERVAL_MS = 60 * 60_000;
const LADDER_ARCHIVE_MS = 30 * 24 * 60 * 60_000;

export class HostedMarketData {
  private readonly sql;
  private readonly enqueue;
  private readonly pending;
  private readonly expired;
  private readonly remove;
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight: Promise<void> | undefined;
  private nextPruneAt = 0;
  private syncedAt: number | undefined;

  constructor(database: WickDatabase, url: string, private readonly logger: BackendLogger) {
    let parsed: URL;
    try { parsed = new URL(url); }
    catch { throw new Error("DATABASE_URL must be a PostgreSQL URL"); }
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") throw new Error("DATABASE_URL must be a PostgreSQL URL");
    parsed.searchParams.delete("sslmode");
    this.sql = postgres(parsed.toString(), {
      ssl: "verify-full",
      max: 3,
      connect_timeout: 5,
      connection: { statement_timeout: 5_000, lock_timeout: 3_000 },
    });
    this.enqueue = database.prepare("INSERT OR IGNORE INTO market_data_outbox (id, captured_at, payload) VALUES (?, ?, ?)");
    this.pending = database.prepare<[], { id: string; payload: string }>("SELECT id, payload FROM market_data_outbox ORDER BY captured_at, id LIMIT 100");
    this.expired = database.prepare("DELETE FROM market_data_outbox WHERE captured_at < ?");
    const deleteRow = database.prepare("DELETE FROM market_data_outbox WHERE id = ?");
    this.remove = database.transaction((ids: string[]) => {
      for (const id of ids) deleteRow.run(id);
    });
  }

  queueUpDown(price: RecordedUpDownPrice): void {
    const write: PendingWrite = { kind: "up_down", data: price };
    this.enqueue.run(`up_down:${price.contract.symbol}:${price.bucket}`, price.ts, JSON.stringify(write));
  }

  queueOptions(capturedAt: number, quotes: DeribitOptionQuote[], snapshot?: DeribitOptionSnapshot): void {
    if (!quotes.length && !snapshot?.quotes.length) return;
    const sampledAt = Math.floor(capturedAt / 60_000) * 60_000;
    const write: PendingWrite = {
      kind: "deribit", sampledAt, quotes, ...(snapshot?.quotes.length ? { chain: packChain(snapshot) } : {}),
    };
    this.enqueue.run(`deribit:${sampledAt}`, capturedAt, JSON.stringify(write));
  }

  queueTheoInputs(pricedAt: number, inputs: MarketTheoInput[]): void {
    const write: PendingWrite = { kind: "theo", pricedAt, inputs };
    this.enqueue.run(`theo:${pricedAt}`, pricedAt, JSON.stringify(write));
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.flush(); }, FLUSH_INTERVAL_MS);
    this.timer.unref();
    void this.flush();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.inFlight;
    await this.sql.end({ timeout: 5 });
  }

  lastSync(): number | undefined {
    return this.syncedAt;
  }

  flush(): Promise<void> {
    this.inFlight ??= this.writeBatch().catch((error: unknown) => {
      this.logger.warn({ code: databaseErrorCode(error) }, "Hosted market data sync failed; queued samples retained in SQLite");
    }).finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }

  private async writeBatch(): Promise<void> {
    const now = Date.now();
    const cutoff = now - MARKET_HISTORY_RETENTION_MS;
    const prune = now >= this.nextPruneAt;
    if (prune) this.expired.run(cutoff);
    const rows = this.pending.all();
    if (!rows.length && !prune) return;

    const contracts = new Map<string, Record<string, string | number>>();
    const prices: Array<Record<string, Column>> = [];
    const options: Array<Record<string, Column>> = [];
    const chains: Array<Record<string, Column>> = [];
    const theos: Array<Record<string, Column>> = [];
    for (const row of rows) {
      const write = JSON.parse(row.payload) as PendingWrite;
      if (write.kind === "up_down") {
        const { contract, bucket, ts, theo, spot, geminiMid, geminiBid, geminiAsk } = write.data;
        const { symbol, duration, strike, openTs, expiryTs } = contract;
        contracts.set(symbol, { symbol, duration, strike, open_ts: openTs, expiry_ts: expiryTs });
        prices.push({
          symbol, bucket, ts, theo, spot,
          gemini_mid: geminiMid ?? null, gemini_bid: geminiBid ?? null, gemini_ask: geminiAsk ?? null,
        });
      } else if (write.kind === "deribit") {
        if (write.chain) {
          chains.push({
            sampled_at: new Date(write.sampledAt), captured_at: new Date(write.chain.capturedAt),
            spot: write.chain.spot, option_count: write.chain.optionCount, encoding: "gzip-json-v1",
            payload: Buffer.from(write.chain.base64, "base64"),
          });
        }
        for (const quote of write.quotes) {
          options.push({
            instrument_name: quote.instrumentName,
            sampled_at: new Date(write.sampledAt),
            provider_at: quote.providerAt === null ? null : new Date(quote.providerAt),
            expires_at: new Date(quote.expiryMs),
            strike: quote.strike,
            option_type: quote.optionType,
            quote_currency: quote.quoteCurrency,
            bid_price: quote.bidPrice,
            ask_price: quote.askPrice,
            mark_price: quote.markPrice,
            mark_iv_pct: quote.markIvPct,
            underlying_price: quote.underlyingPrice,
          });
        }
      } else {
        for (const input of write.inputs) {
          theos.push({
            sampled_at: new Date(Math.floor(write.pricedAt / 60_000) * 60_000), priced_at: new Date(write.pricedAt),
            symbol: input.symbol, duration: input.duration, expiry_at: new Date(input.expiryTs),
            model: input.model, vol_source: input.volSource, spot: input.spot, strike: input.strike,
            time_years: input.timeYears, volatility: input.volatility, theo: input.theo,
            gemini_mid: input.geminiMid ?? null, gemini_bid: input.geminiBid ?? null, gemini_ask: input.geminiAsk ?? null,
            twap_window_seconds: input.model === "up_down_v1" ? input.twapWindowSeconds : null,
            half_width_fraction: input.model === "ladder_v1" ? input.halfWidthFraction : null,
            lower_volatility: input.model === "ladder_v1" ? input.lowerVolatility : null,
            upper_volatility: input.model === "ladder_v1" ? input.upperVolatility : null,
          });
        }
      }
    }

    await this.sql.begin(async (tx) => {
      if (contracts.size) await tx`
        INSERT INTO wick_market_data.up_down_contracts ${tx([...contracts.values()])}
        ON CONFLICT (symbol) DO NOTHING
      `;
      if (prices.length) await tx`
        INSERT INTO wick_market_data.up_down_prices ${tx(prices)}
        ON CONFLICT (symbol, bucket) DO NOTHING
      `;
      if (options.length) {
        // Leave room under PostgreSQL's bind-parameter limit on a backlog of option snapshots.
        for (let start = 0; start < options.length; start += 1_000) {
          await tx`
            INSERT INTO wick_market_data.option_chain_snapshots ${tx(options.slice(start, start + 1_000))}
            ON CONFLICT (instrument_name, sampled_at) DO NOTHING
          `;
        }
      }
      if (chains.length) await tx`
        INSERT INTO wick_market_data.deribit_chain_minutes ${tx(chains)}
        ON CONFLICT (sampled_at) DO NOTHING
      `;
      for (let start = 0; start < theos.length; start += 1_000) {
        await tx`
          INSERT INTO wick_market_data.market_theo_minutes ${tx(theos.slice(start, start + 1_000))}
          ON CONFLICT (sampled_at, symbol) DO NOTHING
        `;
      }
      if (prune) {
        await tx`DELETE FROM wick_market_data.up_down_contracts WHERE expiry_ts < ${cutoff}`;
        await tx`DELETE FROM wick_market_data.option_chain_snapshots WHERE sampled_at < ${new Date(cutoff)}`;
        await tx`DELETE FROM wick_market_data.deribit_chain_minutes WHERE sampled_at < ${new Date(cutoff)}`;
        await tx`DELETE FROM wick_market_data.market_theo_minutes WHERE sampled_at < ${new Date(cutoff)} AND model = 'up_down_v1'`;
        await tx`DELETE FROM wick_market_data.ladder_history_backfills WHERE expiry_at < ${new Date(now - LADDER_ARCHIVE_MS)}`;
        await tx`DELETE FROM wick_market_data.market_theo_minutes WHERE expiry_at < ${new Date(now - LADDER_ARCHIVE_MS)} AND model = 'ladder_v1'`;
      }
    });

    this.remove(rows.map(({ id }) => id));
    if (rows.length) this.syncedAt = Date.now();
    if (prune) this.nextPruneAt = now + PRUNE_INTERVAL_MS;
  }

  async expiredContracts(now: number): Promise<ArchivedUpDownContract[]> {
    const rows = await this.sql<Array<Omit<ArchivedUpDownContract, "openTs" | "expiryTs"> & { openTs: string; expiryTs: string }>>`
      SELECT symbol, duration, strike, open_ts AS "openTs", expiry_ts AS "expiryTs"
      FROM wick_market_data.up_down_contracts
      WHERE expiry_ts BETWEEN ${now - MARKET_HISTORY_RETENTION_MS} AND ${now}
      ORDER BY expiry_ts DESC, symbol LIMIT 100
    `;
    return rows.map((row) => ({ ...row, openTs: Number(row.openTs), expiryTs: Number(row.expiryTs) }));
  }

  async prices(symbol: string, now: number): Promise<MarketHistoryPoint[]> {
    const rows = await this.sql<Array<Omit<Parameters<typeof historyPoint>[0], "ts"> & { ts: string }>>`
      SELECT prices.ts, coalesce(r.theo, prices.theo) AS theo, (r.theo IS NOT NULL) AS reconstructed, prices.spot, prices.gemini_mid AS "geminiMid",
        prices.gemini_bid AS "geminiBid", prices.gemini_ask AS "geminiAsk"
      FROM wick_market_data.up_down_prices prices JOIN wick_market_data.up_down_contracts contracts USING (symbol)
      LEFT JOIN wick_market_data.up_down_theo_replays r USING (symbol, bucket)
      WHERE (prices.ts < ${SHORT_REPLAY_START} OR prices.ts >= ${SHORT_REPLAY_END} OR r.theo IS NOT NULL)
        AND prices.symbol = ${symbol} AND contracts.expiry_ts >= ${now - MARKET_HISTORY_RETENTION_MS}
      ORDER BY prices.bucket
    `;
    return rows.map((row) => historyPoint({ ...row, ts: Number(row.ts) }));
  }

  async expiredLadderContracts(now: number): Promise<ArchivedLadderContract[]> {
    const rows = await this.sql<Array<Omit<ArchivedLadderContract, "expiryTs"> & { expiry: Date }>>`
      SELECT DISTINCT symbol, strike, expiry_at AS expiry
      FROM wick_market_data.market_theo_minutes
      WHERE model = 'ladder_v1' AND expiry_at BETWEEN ${new Date(now - LADDER_ARCHIVE_MS)} AND ${new Date(now)}
      UNION
      SELECT symbol, strike, expiry_at AS expiry FROM wick_market_data.ladder_history_backfills
      WHERE expiry_at BETWEEN ${new Date(now - LADDER_ARCHIVE_MS)} AND ${new Date(now)}
      ORDER BY expiry DESC, strike, symbol
    `;
    return rows.map(({ expiry, ...row }) => ({ ...row, expiryTs: expiry.getTime() }));
  }

  async ladderPrices(symbol: string, now: number): Promise<MarketHistoryPoint[]> {
    const rows = await this.sql<Array<Omit<Parameters<typeof historyPoint>[0], "ts"> & { pricedAt: Date }>>`
      WITH points AS (
        SELECT sample.sampled_at, sample.priced_at, coalesce(replay.theo, sample.theo) AS theo, sample.spot,
          replay.theo IS NOT NULL AS reconstructed, sample.gemini_mid, sample.gemini_bid, sample.gemini_ask
        FROM wick_market_data.market_theo_minutes sample
        LEFT JOIN wick_market_data.ladder_theo_replays replay USING (sampled_at, symbol)
        WHERE sample.model = 'ladder_v1' AND sample.symbol = ${symbol} AND sample.expiry_at >= ${new Date(now - LADDER_ARCHIVE_MS)}
        UNION ALL
        SELECT b.sampled_at, b.priced_at, b.theo, b.spot, true, NULL, NULL, NULL
        FROM wick_market_data.ladder_history_backfills b
        WHERE b.symbol = ${symbol} AND b.expiry_at >= ${new Date(now - LADDER_ARCHIVE_MS)}
          AND NOT EXISTS (SELECT FROM wick_market_data.market_theo_minutes s WHERE s.symbol = b.symbol AND s.sampled_at = b.sampled_at)
      )
      SELECT DISTINCT ON (bucket) priced_at AS "pricedAt", theo, spot, reconstructed,
        gemini_mid AS "geminiMid", gemini_bid AS "geminiBid", gemini_ask AS "geminiAsk",
        CASE WHEN sampled_at >= ${new Date(now - 24 * 60 * 60_000)} THEN sampled_at
          ELSE date_bin(interval '15 minutes', sampled_at, timestamptz '2000-01-01')
        END AS bucket
      FROM points
      ORDER BY bucket, priced_at DESC
    `;
    return rows.map(({ pricedAt, theo, reconstructed, spot, geminiMid, geminiBid, geminiAsk }) =>
      historyPoint({ ts: pricedAt.getTime(), theo, ...(reconstructed ? { reconstructed } : {}), spot, geminiMid, geminiBid, geminiAsk }));
  }
}

function packChain(snapshot: DeribitOptionSnapshot): PackedChain {
  const data = {
    quoteCurrency: "BTC",
    columns: ["instrumentName", "expiryMs", "strike", "optionType", "providerAt", "bidPrice", "askPrice", "markPrice", "markIvPct", "underlyingPrice"],
    quotes: snapshot.quotes.map((quote) => [
      quote.instrumentName, quote.expiryMs, quote.strike, quote.optionType, quote.providerAt,
      quote.bidPrice, quote.askPrice, quote.markPrice, quote.markIvPct, quote.underlyingPrice,
    ]),
  };
  return {
    capturedAt: snapshot.capturedAt, spot: snapshot.spot, optionCount: snapshot.quotes.length,
    base64: gzipSync(JSON.stringify(data)).toString("base64"),
  };
}

export function databaseErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") return error.code;
  return "UNKNOWN";
}
