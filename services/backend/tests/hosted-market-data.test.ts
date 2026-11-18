import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { DeribitOptionQuote } from "@wick/vol";
import { expect, it, vi } from "vitest";
import { openWickDatabase } from "../src/indexer/database.js";
import { HostedMarketData } from "../src/pricer/hosted-market-data.js";
import { selectOptionSnapshots } from "../src/pricer/option-snapshots.js";

const pg = vi.hoisted(() => ({ begin: vi.fn(), end: vi.fn() }));
vi.mock("postgres", () => ({ default: () => pg }));

const now = Date.now();
const quote = (expiryMs: number, strike: number, optionType: "call" | "put"): DeribitOptionQuote => ({
  instrumentName: `${expiryMs}-${strike}-${optionType}`, expiryMs, strike, optionType, quoteCurrency: "BTC",
  providerAt: now - 500, bidPrice: null, askPrice: .02, markPrice: .01, markIvPct: 55, underlyingPrice: 65_000,
});
const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };

it("queues samples once per bucket and retries them after a restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "wick-hosted-market-data-"));
  const databasePath = join(directory, "wick.db");
  const url = "postgresql://wick_market_writer@db.example.com/postgres";
  const expiry = now + 3_600_000;
  const batch = [{
    contract: { symbol: "BTC15M", duration: "15m", strike: 65_000, openTs: now - 30_000, expiryTs: now + 870_000 },
    bucket: Math.floor(now / 5_000), ts: now, theo: .58, spot: 65_100, geminiMid: null, geminiAsk: .56,
  }];

  try {
    const initial = openWickDatabase(databasePath);
    try {
      const hosted = new HostedMarketData(initial, url, logger);
      hosted.queueUpDown(batch[0]!);
      hosted.queueUpDown(batch[0]!);
      hosted.queueOptions(now, [quote(expiry, 65_000, "call")], {
        capturedAt: now, spot: 65_000, quotes: [quote(expiry, 65_000, "call"), quote(expiry, 65_000, "put")],
      });
      hosted.queueOptions(now, [quote(expiry, 65_000, "call")]);
      hosted.queueTheoInputs(now, [{
        symbol: "BTC15M", duration: "15m", expiryTs: now + 870_000, spot: 65_100, strike: 65_000, theo: .58,
        volSource: "deribit", model: "up_down_v1", timeYears: .00002, volatility: .5, twapWindowSeconds: 60,
      }]);
      pg.begin.mockRejectedValueOnce(Object.assign(new Error("test timeout"), { code: "ETIMEDOUT" }));
      await hosted.flush();
      expect(hosted.lastSync()).toBeUndefined();
      expect(initial.prepare("SELECT count(*) AS count FROM market_data_outbox").get()).toEqual({ count: 3 });
    } finally { initial.close(); }

    const reopened = openWickDatabase(databasePath);
    try {
      const statements = new Map<string, unknown>();
      pg.begin.mockImplementationOnce(async (run: (tx: unknown) => Promise<void>) => {
        await run((template: TemplateStringsArray | unknown[], payload?: unknown) => {
          if (!("raw" in template)) return template;
          statements.set(template.join("").trim().split(/\s+/).slice(0, 3).join(" "), payload);
        });
      });
      const hosted = new HostedMarketData(reopened, url, logger);
      await hosted.flush();
      expect(hosted.lastSync()).toBeGreaterThanOrEqual(now);
      expect(statements.get("INSERT INTO wick_market_data.up_down_prices")).toEqual([
        {
          symbol: "BTC15M", bucket: Math.floor(now / 5_000), ts: now, theo: .58, spot: 65_100,
          gemini_mid: null, gemini_bid: null, gemini_ask: .56,
        },
      ]);
      expect(statements.get("INSERT INTO wick_market_data.option_chain_snapshots")).toMatchObject([
        { instrument_name: quote(expiry, 65_000, "call").instrumentName, bid_price: null, ask_price: .02 },
      ]);
      expect(statements.get("INSERT INTO wick_market_data.market_theo_minutes")).toMatchObject([
        { symbol: "BTC15M", model: "up_down_v1", twap_window_seconds: 60, half_width_fraction: null },
      ]);
      const chain = statements.get("INSERT INTO wick_market_data.deribit_chain_minutes") as Array<{ payload: Buffer; option_count: number }>;
      expect(chain[0]?.option_count).toBe(2);
      const payload = JSON.parse(gunzipSync(chain[0]!.payload).toString("utf8"));
      expect(payload.quotes.map((row: unknown[]) => row[0])).toEqual([
        quote(expiry, 65_000, "call").instrumentName, quote(expiry, 65_000, "put").instrumentName,
      ]);
      expect(reopened.prepare("SELECT count(*) AS count FROM market_data_outbox").get()).toEqual({ count: 0 });
    } finally { reopened.close(); }
  } finally { rmSync(directory, { recursive: true }); }
});

it("selects nearby calls and puts without inventing expired instruments", () => {
  const near = now + 3_600_000;
  const far = now + 7_200_000;
  const quotes = [near, far, now - 1].flatMap((expiryMs) =>
    [63_000, 64_000, 66_000, 67_000].flatMap((strike) => [quote(expiryMs, strike, "call"), quote(expiryMs, strike, "put")]));
  const result = selectOptionSnapshots({ capturedAt: now, spot: 65_000, quotes }, []);
  expect(result.map((item) => item.instrumentName)).toEqual([
    `${near}-64000-call`, `${near}-66000-call`, `${near}-64000-put`, `${near}-66000-put`,
  ]);
});
