import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  classifyEvent,
  discoverBtcMarkets,
  GeminiClient,
  GeminiQuoteStream,
  geminiEventsResponseSchema,
  geminiSpotTickerSchema,
  parseBookTicker,
  quoteFromContract,
} from "../src/index.js";
import type { GeminiQuoteStreamOptions } from "../src/stream.js";

const fixture = async (name: string) =>
  JSON.parse(
    await readFile(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), "utf8"),
  ) as unknown;

describe("Gemini live REST fixtures", () => {
  it("parses the complete active BTC response and discovers required buckets", async () => {
    const response = geminiEventsResponseSchema.parse(await fixture("active-btc.json"));
    expect(response.data).toHaveLength(23);
    const now = Date.parse("2026-11-16T22:55:30.000Z");
    const discovered = discoverBtcMarkets(response.data, 65_411.15, now);
    const buckets = new Set(discovered.map((item) => item.bucket));
    expect(buckets).toEqual(new Set(["five_minute", "fifteen_minute", "hourly", "daily", "weekly", "month_end"]));
    expect(discovered.filter((item) => item.bucket === "five_minute")).toHaveLength(2);
    expect(discovered.filter((item) => item.bucket === "fifteen_minute")).toHaveLength(2);
    expect(discovered.flatMap((item) => item.contracts).every((contract) => {
      if (contract.strike.type !== "above") return true;
      const strike = Number(contract.strike.value);
      return strike >= 65_411.15 * 0.9 && strike <= 65_411.15 * 1.1;
    })).toBe(true);
  });

  it("classifies same-series ladders by expiry and title instead of series alone", async () => {
    const { data } = geminiEventsResponseSchema.parse(await fixture("active-btc.json"));
    const now = Date.parse("2026-11-16T22:55:30.000Z");
    const classifications = new Map(data.map((event) => [event.ticker, classifyEvent(event, now)]));
    expect(classifications.get("BTC2611162300")).toBe("hourly");
    expect(classifications.get("BTC2611172200")).toBe("daily");
    expect(classifications.get("BTC2611202200")).toBe("weekly");
    expect(classifications.get("BTC2611302200")).toBe("month_end");
  });

  it("parses official settled outcomes and repeating-decimal settlement values", async () => {
    const response = geminiEventsResponseSchema.parse(await fixture("settled-btc15m.json"));
    expect(response.data).toHaveLength(20);
    const event = response.data[0]!;
    expect(event.status).toBe("settled");
    expect(event.settlement?.value).toBe("65040.33233333333");
    expect(event.contracts[0]?.resolutionSide).toBe("yes");
    expect(event.contracts[0]?.settlementValue).toBe(event.settlement?.value);
  });

  it("parses Gemini spot", async () => {
    const ticker = geminiSpotTickerSchema.parse(await fixture("spot-btcusd.json"));
    expect(Number(ticker.bid)).toBeGreaterThan(0);
    expect(Number(ticker.ask)).toBeGreaterThanOrEqual(Number(ticker.bid));
    expect(ticker.volume.timestamp).toBeGreaterThan(0);
  });
});

describe("quotes", () => {
  it("uses REST best bid/ask and computes mid", async () => {
    const { data } = geminiEventsResponseSchema.parse(await fixture("active-btc.json"));
    const contract = data.find((event) => event.ticker === "BTC15M2611162300")!.contracts[0]!;
    const quote = quoteFromContract(contract, 123);
    expect(quote.bid).toBe(Number(contract.prices.bestBid));
    expect(quote.ask).toBe(Number(contract.prices.bestAsk));
    expect(quote.mid).toBeCloseTo((Number(contract.prices.bestBid) + Number(contract.prices.bestAsk)) / 2, 12);
    expect(quote.last).toBe(Number(contract.prices.lastTradePrice));
    expect(quote.ts).toBe(123);
  });

  it("accepts one-sided REST books without inventing a mid", async () => {
    const { data } = geminiEventsResponseSchema.parse(await fixture("active-btc.json"));
    const base = data[0]!.contracts[0]!;
    const quote = quoteFromContract({ ...base, prices: { bestBid: "0.42" } }, 123);
    expect(quote).toEqual({ bid: 0.42, ts: 123 });
  });

  it("parses nanosecond websocket timestamps", () => {
    const parsed = parseBookTicker({
      u: "7",
      E: "1794869280123456789",
      s: "GEMI-BTC15M2611162300-UP",
      b: "0.56",
      B: "4.2",
      a: "0.66",
      A: "2.1",
      c: "0.61",
      C: "1",
    });
    expect(parsed.symbol).toBe("GEMI-BTC15M2611162300-UP");
    expect(parsed.quote).toMatchObject({ bid: 0.56, ask: 0.66, last: 0.61, ts: 1_794_869_280_123 });
    expect(parsed.quote.mid).toBeCloseTo(0.61, 12);
  });

  it("treats the live empty-string websocket bid as absent", () => {
    const parsed = parseBookTicker({
      u: 1764531689408082,
      E: "1794869889494298185",
      s: "gemi-btc15m2611162300-up",
      b: "",
      B: "",
      a: "0.0200",
      A: "9.06",
      c: "0.3700",
      C: "3.75",
    });
    expect(parsed.quote).toMatchObject({ ask: 0.02, last: 0.37 });
    expect(parsed.quote.bid).toBeUndefined();
    expect(parsed.quote.mid).toBeUndefined();
  });
});

describe("GeminiQuoteStream", () => {
  it("accepts the live acknowledgement shape and maps lowercase live symbols to the requested symbol", async () => {
    type Listener = (event?: { data?: unknown; code?: number; reason?: string }) => void;
    const listeners = new Map<string, Listener[]>();
    const sent: string[] = [];
    const socket = {
      addEventListener(type: string, listener: Listener) {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
      send(data: string) { sent.push(data); },
      close() { /* no-op */ },
      emit(type: string, event: { data?: unknown; code?: number; reason?: string } = {}) {
        for (const listener of listeners.get(type) ?? []) listener(event);
      },
    };
    const client = {
      listEvents: async () => ({ data: [], pagination: { limit: 500, offset: 0, total: 0 } }),
    } as unknown as GeminiClient;
    const quotes: Array<{ symbol: string; bid: number | undefined }> = [];
    const stream = new GeminiQuoteStream({
      symbols: ["GEMI-BTC15M2611162300-UP"],
      client,
      wsFactory: (() => socket) as unknown as NonNullable<GeminiQuoteStreamOptions["wsFactory"]>,
      onQuote: (symbol, quote) => quotes.push({ symbol, bid: quote.bid }),
    });
    stream.start();
    socket.emit("open");
    socket.emit("message", { data: JSON.stringify({ id: "wick-quotes", status: 200 }) });
    socket.emit("message", {
      data: JSON.stringify({
        u: 1764531689293733,
        E: "1794869662774827547",
        s: "gemi-btc15m2611162300-up",
        b: "0.0100",
        B: "46.00",
        a: "0.0800",
        A: "15.00",
        c: "0.3700",
        C: "3.75",
      }),
    });
    await Promise.resolve();
    expect(JSON.parse(sent[0]!)).toMatchObject({ method: "SUBSCRIBE" });
    expect(quotes).toEqual([{ symbol: "GEMI-BTC15M2611162300-UP", bid: 0.01 }]);
    stream.stop();
  });
});
