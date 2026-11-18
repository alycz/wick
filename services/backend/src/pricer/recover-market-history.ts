import postgres from "postgres";
import { GeminiClient } from "@wick/gemini";
import { BINARY_TWAP_WINDOW_SECONDS, SECONDS_PER_YEAR, ladderTheo, upDownTheo } from "@wick/pricing";
import { VolSurface, type VolPoint } from "@wick/vol";
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
    const shortRows: {symbol: string; bucket: string; option_captured_at: Date | null; option_sampled_at: Date | null; theo: number}[] = [];
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
    const shortTheo = (s: ShortPoint, volatility: number) => upDownTheo({
      spot: s.spot, strike: s.strike, volatility,
      timeYears: Math.max(1, (Number(s.expiry_ts) - Number(s.ts)) / 1_000) / SECONDS_PER_YEAR,
      twapWindowSeconds: BINARY_TWAP_WINDOW_SECONDS,
    }).probability;
    visit(short, (s) => Number(s.ts), (s, surface, captured) => {
      shortRows.push({ symbol: s.symbol, bucket: s.bucket, option_captured_at: captured, option_sampled_at: null,
        theo: shortTheo(s, surface.vol(Number(s.expiry_ts), s.strike)) });
    });
    // The first collector retained a strike subset before it began capturing whole chains.
    // Its observation time is rounded down. Use only completed buckets, with real IV on both sides.
    const firstComplete = chains[0]?.captured_at;
    if (firstComplete) {
      const earlyOptions = await sql<{sampled_at: Date; expires_at: Date; strike: number; iv: number; forward: number}[]>`
        SELECT sampled_at, expires_at, strike, mark_iv_pct / 100 AS iv, underlying_price AS forward
        FROM wick_market_data.option_chain_snapshots
        WHERE sampled_at >= ${new Date(SHORT_REPLAY_START - 60_000)} AND sampled_at < ${firstComplete}
          AND mark_iv_pct > 0 AND mark_iv_pct <= 500 AND underlying_price > 0
      `;
      const buckets = new Map<number, VolPoint[]>();
      for (const option of earlyOptions) {
        const ts = option.sampled_at.getTime();
        const points = buckets.get(ts) ?? [];
        points.push({ ts, expiryMs: option.expires_at.getTime(), strike: option.strike, vol: option.iv, forward: option.forward });
        buckets.set(ts, points);
      }
      for (const sample of short) {
        const ts = Number(sample.ts);
        if (ts >= firstComplete.getTime()) break;
        const bucket = Math.floor(ts / 60_000) * 60_000 - 60_000;
        const points = buckets.get(bucket) ?? [];
        const nearest = Math.min(...points.filter((p) => p.expiryMs > ts).map((p) => p.expiryMs));
        const smile = points.filter((p) => p.expiryMs === nearest);
        if (nearest < Number(sample.expiry_ts) || !smile.some(p => p.strike <= sample.strike)
          || !smile.some(p => p.strike >= sample.strike)) continue;
        const surface = new VolSurface(() => ts);
        surface.replace(smile);
        shortRows.push({ symbol: sample.symbol, bucket: sample.bucket, option_captured_at: null, option_sampled_at: new Date(bucket),
          theo: shortTheo(sample, surface.vol(nearest, sample.strike)) });
      }
    }
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
