import { z } from "zod";
import { fetchJsonWithRetry } from "./http.js";
import { VolSurface } from "./surface.js";
import type { Clock, FetchLike, Logger, SpotSnapshot, VolPoint, VolSource } from "./types.js";

const instrumentSchema = z.object({
  instrument_name: z.string(),
  is_active: z.boolean(),
  option_details: z.object({ expiry: z.number(), strike: z.string(), option_type: z.enum(["C", "P"]) }),
});
const tickerSchema = z.object({
  t: z.number(),
  I: z.string(),
  option_pricing: z.object({
    i: z.string(),
    bi: z.string(),
    ai: z.string(),
    f: z.string(),
  }).nullable(),
});

export interface DeriveOptions {
  restUrl?: string;
  fetchImpl?: FetchLike;
  now?: Clock;
  logger?: Logger;
  staleAfterMs?: number;
  refreshMs?: number;
  maxExpiries?: number;
  timers?: boolean;
}

const consoleLogger: Logger = {
  info: (fields, message) => console.info(JSON.stringify({ level: "info", message, ...fields })),
  warn: (fields, message) => console.warn(JSON.stringify({ level: "warn", message, ...fields })),
};

export class DeriveVolSource implements VolSource {
  readonly name = "derive" as const;
  private readonly restUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: Clock;
  private readonly logger: Logger;
  private readonly staleAfterMs: number;
  private readonly refreshMs: number;
  private readonly maxExpiries: number;
  private readonly timers: boolean;
  private readonly surface: VolSurface;
  private readonly instruments = new Map<string, z.infer<typeof instrumentSchema>>();
  private currentSpot: SpotSnapshot = { px: Number.NaN, ts: 0 };
  private timer?: ReturnType<typeof setInterval>;
  private refreshing = false;
  private lastInstrumentRefresh = 0;

  constructor(options: DeriveOptions = {}) {
    this.restUrl = options.restUrl ?? process.env.DERIVE_REST ?? "https://api.derive.xyz/v3";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.logger = options.logger ?? consoleLogger;
    this.staleAfterMs = options.staleAfterMs ?? 5_000;
    this.refreshMs = options.refreshMs ?? 5_000;
    this.maxExpiries = options.maxExpiries ?? 8;
    this.timers = options.timers ?? true;
    this.surface = new VolSurface(this.now);
  }

  async start(): Promise<void> {
    await this.refresh();
    if (this.timers) this.timer = setInterval(() => void this.refresh().catch((error) => {
      this.logger.warn({ source: this.name, error: error instanceof Error ? error.message : String(error) }, "Vol source refresh failed");
    }), this.refreshMs);
  }

  stop(): void { if (this.timer) clearInterval(this.timer); }
  probe(): Promise<void> { return this.refresh(); }
  spot(): SpotSnapshot { return { ...this.currentSpot }; }
  vol(expiryMs: number, strike: number): number { return this.surface.vol(expiryMs, strike); }
  healthy(): boolean {
    const now = this.now();
    return Number.isFinite(this.currentSpot.px)
      && now - this.currentSpot.ts <= this.staleAfterMs
      && this.surface.pointCount() > 0
      && now - this.surface.lastUpdatedAt() <= this.staleAfterMs;
  }
  surfaceStats(): { expiries: number; points: number; updatedAt: number } {
    return { expiries: this.surface.expiries().length, points: this.surface.pointCount(), updatedAt: this.surface.lastUpdatedAt() };
  }

  async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      await this.refreshUnlocked();
    } finally {
      this.refreshing = false;
    }
  }

  private async refreshUnlocked(): Promise<void> {
    if (this.instruments.size === 0 || this.now() - this.lastInstrumentRefresh >= 30 * 60_000) await this.refreshInstruments();
    const expiries = [...new Set([...this.instruments.values()]
      .filter((instrument) => instrument.is_active)
      .map((instrument) => instrument.option_details.expiry))]
      .sort((a, b) => a - b)
      .slice(0, this.maxExpiries);
    const payloads = await Promise.all(expiries.map((expiry) => this.post("public/get_tickers", {
      instrument_type: "option",
      currency: "BTC",
      expiry_date: this.expiryDate(expiry),
    })));
    const points: VolPoint[] = [];
    let newestSpot: SpotSnapshot | undefined;
    for (const payload of payloads) {
      const parsed = z.object({ result: z.object({ tickers: z.record(tickerSchema) }) }).parse(payload);
      for (const [name, ticker] of Object.entries(parsed.result.tickers)) {
        const instrument = this.instruments.get(name);
        const pricing = ticker.option_pricing;
        if (!instrument || !pricing) continue;
        const markIv = Number(pricing.i);
        const bidIv = Number(pricing.bi);
        const askIv = Number(pricing.ai);
        const vol = markIv > 0 ? markIv : bidIv > 0 && askIv > 0 ? (bidIv + askIv) / 2 : Math.max(bidIv, askIv);
        const forward = Number(pricing.f);
        const spot = Number(ticker.I);
        if (Number.isFinite(spot) && spot > 0 && (!newestSpot || ticker.t > newestSpot.ts)) newestSpot = { px: spot, ts: ticker.t };
        if (!Number.isFinite(vol) || vol <= 0 || !Number.isFinite(forward) || forward <= 0) continue;
        points.push({
          expiryMs: instrument.option_details.expiry * 1_000,
          strike: Number(instrument.option_details.strike),
          vol,
          forward,
          ts: ticker.t,
        });
      }
    }
    if (newestSpot) this.currentSpot = newestSpot;
    this.surface.replace(points);
  }

  private async refreshInstruments(): Promise<void> {
    const payload = await this.post("public/get_all_instruments", {
      instrument_type: "option",
      currency: "BTC",
      expired: false,
      page: 1,
      page_size: 1_000,
    });
    const parsed = z.object({ result: z.object({ instruments: z.array(instrumentSchema) }) }).parse(payload);
    this.instruments.clear();
    for (const instrument of parsed.result.instruments) this.instruments.set(instrument.instrument_name, instrument);
    this.lastInstrumentRefresh = this.now();
  }

  private post(path: string, body: Record<string, unknown>): Promise<unknown> {
    return fetchJsonWithRetry(this.fetchImpl, `${this.restUrl}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private expiryDate(expirySeconds: number): number {
    const date = new Date(expirySeconds * 1_000);
    return Number(`${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`);
  }
}
