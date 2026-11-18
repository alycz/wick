import { decodeChain, MAX_CHAIN_AGE_MS, type Chain } from "./replay-chain.js";
import postgres from "postgres";
import { ladderTheo } from "@wick/pricing";
import { VolSurface, type VolPoint } from "@wick/vol";

interface LadderSample {
  sampled_at: Date;
  priced_at: Date;
  expiry_at: Date;
  symbol: string;
  spot: number;
  strike: number;
  time_years: number;
  half_width_fraction: number;
}

async function main() {
  const [cutoffArg, mode, ...rest] = process.argv.slice(2);
  const cutoff = new Date(cutoffArg ?? "");
  if (!Number.isFinite(cutoff.valueOf()) || (mode !== undefined && mode !== "--apply") || rest.length) {
    throw new Error("Usage: node --import tsx src/pricer/replay-ladder-history.ts <UTC cutoff> [--apply]");
  }
  const config = process.env.DATABASE_URL;
  if (!config) throw new Error("DATABASE_URL is required");
  const url = new URL(config);
  url.searchParams.delete("sslmode");
  const sql = postgres(url.toString(), {
    ssl: "verify-full", max: 1, connect_timeout: 5, connection: { statement_timeout: 90_000 },
  });
  try {
    const samples = await sql<LadderSample[]>`
      SELECT sampled_at, priced_at, expiry_at, symbol, spot, strike, time_years, half_width_fraction
      FROM wick_market_data.market_theo_minutes
      WHERE model = 'ladder_v1' AND vol_source = 'deribit' AND priced_at < ${cutoff}
      ORDER BY priced_at, symbol
    `;
    if (!samples.length) throw new Error("No eligible ladder samples");
    const earliest = new Date(samples[0]!.priced_at.getTime() - MAX_CHAIN_AGE_MS);
    const chains = await sql<Chain[]>`
      SELECT captured_at, spot, payload FROM wick_market_data.deribit_chain_minutes
      WHERE captured_at >= ${earliest} AND captured_at < ${cutoff}
      ORDER BY captured_at
    `;
    let chainIndex = -1;
    let points: VolPoint[] = [];
    let surface = new VolSurface();
    let asOf = 0;
    const rows = samples.map((sample) => {
      const pricedAt = sample.priced_at.getTime();
      const previousChain = chainIndex;
      while (chains[chainIndex + 1] && chains[chainIndex + 1]!.captured_at.getTime() <= pricedAt) chainIndex++;
      const chain = chains[chainIndex];
      if (!chain || pricedAt - chain.captured_at.getTime() > MAX_CHAIN_AGE_MS) {
        throw new Error(`Missing a preceding option snapshot for ${sample.symbol} at ${sample.priced_at.toISOString()}`);
      }
      if (chainIndex !== previousChain) points = decodeChain(chain);
      if (asOf !== pricedAt) {
        asOf = pricedAt;
        surface = new VolSurface(() => pricedAt);
        surface.replace(points);
      }
      const expiry = sample.expiry_at.getTime();
      const theo = ladderTheo({
        forward: sample.spot, strike: sample.strike, timeYears: sample.time_years,
        halfWidthFraction: sample.half_width_fraction, volAtStrike: (strike) => surface.vol(expiry, strike),
      });
      if (!Number.isFinite(theo)) throw new Error(`Invalid reconstruction for ${sample.symbol}`);
      return { sampled_at: sample.sampled_at, symbol: sample.symbol, option_captured_at: chain.captured_at, theo };
    });
    if (mode === "--apply") {
      await sql.begin(async (transaction) => {
        for (let index = 0; index < rows.length; index += 1_000) {
          await transaction`INSERT INTO wick_market_data.ladder_theo_replays ${transaction(rows.slice(index, index + 1_000))}
            ON CONFLICT (sampled_at, symbol) DO NOTHING`;
        }
      });
    }
    console.log(JSON.stringify({ applied: mode === "--apply", samples: rows.length, symbols: new Set(rows.map((row) => row.symbol)).size }));
  } finally {
    await sql.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Ladder reconstruction failed");
  process.exitCode = 1;
});
