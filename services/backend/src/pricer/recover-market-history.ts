import postgres from "postgres";
import { GeminiClient } from "@wick/gemini";
import { BINARY_TWAP_WINDOW_SECONDS, SECONDS_PER_YEAR, ladderTheo, upDownTheo } from "@wick/pricing";
import { VolSurface } from "@wick/vol";
import { decodeChain, MAX_CHAIN_AGE_MS, type Chain } from "./replay-chain.js";
import { SHORT_REPLAY_START, SHORT_REPLAY_END } from "./up-down-history.js";

interface ShortPoint { symbol: string; bucket: string; ts: string; expiry_ts: string; spot: number; strike: number }
interface Minute { priced_at: Date; sampled_at: Date; spot: number; half_width_fraction: number; symbols: string[] }
interface Contract { symbol: string; strike: number; from: number; expires: number }

async function datedContracts(tickers: string[]): Promise<Contract[]> {
  const client = new GeminiClient({});
  const contracts: Contract[] = [];
  for (const ticker of tickers) {
    const event = await client.getEvent(ticker);
    if (!event.ticker.startsWith("BTC") || event.type !== "categorical") throw new Error(`Not a dated BTC expiry: ${ticker}`);
    for (const c of event.contracts) {
      if (c.strike.type !== "above" || !c.strike.value) continue;
      const start = Math.max(Date.parse(event.startTime), Date.parse(c.effectiveDate),
        typeof c.createdAt === "string" ? Date.parse(c.createdAt) : 0);
      const strike = Number(c.strike.value);
      if (!(strike > 0) || !Number.isFinite(start)) throw new Error(`Missing contract metadata for ${c.instrumentSymbol}`);
      contracts.push({ symbol: c.instrumentSymbol, from: start, expires: Date.parse(c.expiryDate), strike });
    }
  }
  return contracts;
}

async function main() {
  const [endArg, ...args] = process.argv.slice(2);
  const end = new Date(endArg ?? "");
  const apply = args.includes("--apply");
  const tickers = args.filter((arg) => arg !== "--apply");
  if (!(end.getTime() >= SHORT_REPLAY_END) || end.getTime() > Date.now() || tickers.some((arg) => !/^BTC\d+$/.test(arg))) {
    throw new Error("Usage: recover-market-history.ts <end UTC> [BTC event tickers] [--apply]");
  }
  const contracts = await datedContracts(tickers);
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.searchParams.delete("sslmode");
  const sql = postgres(url.toString(), { ssl: "verify-full", max: 1, connection: { statement_timeout: 90_000 } });
  try {
    const short = await sql<ShortPoint[]>`
      SELECT symbol,bucket,ts,expiry_ts,spot,strike FROM wick_market_data.up_down_prices JOIN wick_market_data.up_down_contracts USING(symbol)
      WHERE ts >= ${SHORT_REPLAY_START} AND ts < ${SHORT_REPLAY_END} AND ts >= open_ts AND ts < expiry_ts ORDER BY ts
    `;
    // Use the actual archived spot and timestamp of each previously priced Deribit ladder.
    const minutes = await sql<Minute[]>`
      SELECT sampled_at, min(priced_at) FILTER (WHERE vol_source = 'deribit') AS priced_at,
        (array_agg(spot ORDER BY priced_at, symbol) FILTER (WHERE vol_source = 'deribit'))[1] AS spot,
        (array_agg(half_width_fraction ORDER BY priced_at, symbol) FILTER (WHERE vol_source = 'deribit'))[1] AS half_width_fraction,
        array_agg(symbol) AS symbols
      FROM wick_market_data.market_theo_minutes
      WHERE model = 'ladder_v1' AND priced_at >= ${new Date(SHORT_REPLAY_START)} AND priced_at < ${end}
      GROUP BY sampled_at HAVING bool_or(vol_source = 'deribit') ORDER BY sampled_at
    `;
    const chains = await sql<Chain[]>`
      SELECT captured_at, spot, payload FROM wick_market_data.deribit_chain_minutes
      WHERE captured_at >= ${new Date(SHORT_REPLAY_START - MAX_CHAIN_AGE_MS)} AND captured_at < ${end}
      ORDER BY captured_at
    `;
    const shortRows: {symbol: string; bucket: string; option_captured_at: Date; theo: number}[] = [];
    const datedRows: {symbol: string; sampled_at: Date; priced_at: Date; expiry_at: Date; option_captured_at: Date; strike: number; spot: number; theo: number}[] = [];
    let clock = 0;
    function visit<T>(samples: T[], time: (sample: T) => number, consume: (sample: T, surface: VolSurface, chainTime: Date) => void) {
      const surface = new VolSurface(() => clock);
      let i = -1;
      for (const sample of samples) {
        clock = time(sample);
        const old = i;
        while (chains[i + 1] && chains[i + 1]!.captured_at.getTime() <= clock) i++;
        const c = chains[i];
        if (!c || clock - c.captured_at.getTime() > MAX_CHAIN_AGE_MS) continue;
        if (old !== i) surface.replace(decodeChain(c));
        if (surface.pointCount()) consume(sample, surface, c.captured_at);
      }
    }
    visit(short, (s) => Number(s.ts), (s, surface, captured) => {
      const expiry = Number(s.expiry_ts);
      const theo = upDownTheo({ spot: s.spot, strike: s.strike, volatility: surface.vol(expiry, s.strike),
        timeYears: Math.max(1, (expiry - clock) / 1_000) / SECONDS_PER_YEAR,
        twapWindowSeconds: BINARY_TWAP_WINDOW_SECONDS }).probability;
      shortRows.push({ symbol: s.symbol, bucket: s.bucket, option_captured_at: captured, theo });
    });
    visit(minutes, (m) => m.priced_at.getTime(), (m, surface, captured) => {
      const recorded = new Set(m.symbols);
      for (const c of contracts) {
        if (recorded.has(c.symbol) || clock < c.from || clock >= c.expires) continue;
        const theo = ladderTheo({ strike: c.strike, forward: m.spot, halfWidthFraction: m.half_width_fraction,
          timeYears: Math.max(1, (c.expires - clock) / 1_000) / SECONDS_PER_YEAR,
          volAtStrike: (k) => surface.vol(c.expires, k) });
        datedRows.push({ symbol: c.symbol, sampled_at: m.sampled_at, priced_at: m.priced_at,
          expiry_at: new Date(c.expires), option_captured_at: captured, spot: m.spot, strike: c.strike, theo });
      }
    });
    if (apply) await sql.begin(async (tx) => {
      for (let i = 0; i < shortRows.length; i += 1_000) {
        await tx`INSERT INTO wick_market_data.up_down_theo_replays ${tx(shortRows.slice(i, i + 1_000))} ON CONFLICT DO NOTHING`;
      }
      for (let i = 0; i < datedRows.length; i += 1_000) {
        await tx`INSERT INTO wick_market_data.ladder_history_backfills ${tx(datedRows.slice(i, i + 1_000))} ON CONFLICT DO NOTHING`;
      }
    });
    console.log(JSON.stringify({ apply, shortReconstructed: shortRows.length, shortMissing: short.length - shortRows.length,
      datedBackfills: datedRows.length, datedSymbols: new Set(datedRows.map(r => r.symbol)).size }));
  } finally { await sql.end(); }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "History recovery failed");
  process.exitCode = 1;
});
