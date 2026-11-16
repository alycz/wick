import { z } from "zod";
import { fetchJsonWithRetry } from "./http.js";
import { VolSurface } from "./surface.js";
import type { Clock, FetchLike, Logger, SpotSnapshot, VolPoint, VolSource } from "./types.js";

const instrumentSchema = z.object({
  instrument_name: z.string(),
  expiration_timestamp: z.number(),
  strike: z.number(),
  option_type: z.enum(["call", "put"]),
});
const summarySchema = z.object({
  instrument_name: z.string(),
  mark_iv: z.number().nullable().optional(),
  underlying_price: z.number().positive().optional(),
  estimated_delivery_price: z.number().positive().optional(),
  creation_timestamp: z.number().optional(),
});
const indexSchema = z.object({ result: z.object({ index_price: z.number().positive() }) });

interface SocketLike {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface DeribitOptions {
  restUrl?: string;
  wsUrl?: string;
  fetchImpl?: FetchLike;
  now?: Clock;
  logger?: Logger;
  staleAfterMs?: number;
  websocket?: boolean;
  socketFactory?: (url: string) => SocketLike;
  timers?: boolean;
}

const consoleLogger: Logger = {
  info: (fields, message) => console.info(JSON.stringify({ level: "info", message, ...fields })),
  warn: (fields, message) => console.warn(JSON.stringify({ level: "warn", message, ...fields })),
};

export class DeribitVolSource implements VolSource {
  readonly name = "deribit" as const;
  private readonly restUrl: string;
  private readonly wsUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: Clock;
  private readonly logger: Logger;
  private readonly staleAfterMs: number;
  private readonly websocket: boolean;
  private readonly socketFactory: (url: string) => SocketLike;
  private readonly timers: boolean;
  private readonly surface: VolSurface;
  private readonly metadata = new Map<string, z.infer<typeof instrumentSchema>>();
  private readonly summaries = new Map<string, z.infer<typeof summarySchema>>();
  private currentSpot: SpotSnapshot = { px: Number.NaN, ts: 0 };
  private socket?: SocketLike;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private probeTimer?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private stopped = false;

  constructor(options: DeribitOptions = {}) {
    this.restUrl = options.restUrl ?? process.env.DERIBIT_REST ?? "https://www.deribit.com/api/v2";
    this.wsUrl = options.wsUrl ?? process.env.DERIBIT_WS ?? "wss://www.deribit.com/ws/api/v2";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.logger = options.logger ?? consoleLogger;
    this.staleAfterMs = options.staleAfterMs ?? 5_000;
    this.websocket = options.websocket ?? true;
    this.socketFactory = options.socketFactory ?? ((url) => new WebSocket(url) as unknown as SocketLike);
    this.timers = options.timers ?? true;
    this.surface = new VolSurface(this.now);
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.refresh();
    if (this.websocket) this.connectSocket();
    if (this.timers) {
      this.refreshTimer = setInterval(() => void this.refresh().catch((error) => this.logFailure("refresh", error)), 30 * 60_000);
      this.probeTimer = setInterval(() => void this.probe().catch((error) => this.logFailure("probe", error)), 60_000);
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.probeTimer) clearInterval(this.probeTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

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
    const [indexPayload, instrumentsPayload, summariesPayload] = await Promise.all([
      this.get("public/get_index_price?index_name=btc_usd"),
      this.get("public/get_instruments?currency=BTC&kind=option&expired=false"),
      this.get("public/get_book_summary_by_currency?currency=BTC&kind=option"),
    ]);
    const index = indexSchema.parse(indexPayload);
    const instruments = z.object({ result: z.array(instrumentSchema) }).parse(instrumentsPayload).result;
    const summaries = z.object({ result: z.array(summarySchema) }).parse(summariesPayload).result;
    this.currentSpot = { px: index.result.index_price, ts: this.now() };
    this.metadata.clear();
    for (const instrument of instruments) this.metadata.set(instrument.instrument_name, instrument);
    this.summaries.clear();
    for (const summary of summaries) this.summaries.set(summary.instrument_name, summary);
    this.rebuildSurface();
  }

  async probe(): Promise<void> {
    const [indexPayload, summariesPayload] = await Promise.all([
      this.get("public/get_index_price?index_name=btc_usd"),
      this.get("public/get_book_summary_by_currency?currency=BTC&kind=option"),
    ]);
    const index = indexSchema.parse(indexPayload);
    const summaries = z.object({ result: z.array(summarySchema) }).parse(summariesPayload).result;
    this.currentSpot = { px: index.result.index_price, ts: this.now() };
    for (const summary of summaries) this.summaries.set(summary.instrument_name, summary);
    if (this.metadata.size === 0) await this.refresh();
    else this.rebuildSurface();
  }

  private async get(path: string): Promise<unknown> {
    return fetchJsonWithRetry(this.fetchImpl, `${this.restUrl}/${path}`);
  }

  private rebuildSurface(): void {
    const ts = this.now();
    const points: VolPoint[] = [];
    for (const [name, summary] of this.summaries) {
      const instrument = this.metadata.get(name);
      if (!instrument || !summary.mark_iv || summary.mark_iv <= 0) continue;
      const forward = summary.underlying_price ?? summary.estimated_delivery_price ?? this.currentSpot.px;
      if (!Number.isFinite(forward) || forward <= 0) continue;
      points.push({
        expiryMs: instrument.expiration_timestamp,
        strike: instrument.strike,
        vol: summary.mark_iv / 100,
        forward,
        ts,
      });
    }
    this.surface.replace(points);
  }

  private connectSocket(): void {
    if (this.stopped) return;
    try {
      const socket = this.socketFactory(this.wsUrl);
      this.socket = socket;
      socket.onopen = () => socket.send(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "public/subscribe",
        params: { channels: ["markprice.options.btc_usd", "deribit_price_index.btc_usd"] },
      }));
      socket.onmessage = (event) => this.onSocketMessage(event.data);
      socket.onerror = () => this.logger.warn({ source: this.name }, "Deribit WebSocket error");
      socket.onclose = () => {
        if (!this.stopped && this.timers) this.reconnectTimer = setTimeout(() => this.connectSocket(), 1_000);
      };
    } catch (error) {
      this.logFailure("websocket_connect", error);
      if (!this.stopped && this.timers) this.reconnectTimer = setTimeout(() => this.connectSocket(), 1_000);
    }
  }

  private onSocketMessage(raw: string): void {
    try {
      const payload = JSON.parse(raw) as { params?: { channel?: string; data?: unknown } };
      const channel = payload.params?.channel ?? "";
      const data = payload.params?.data;
      if (channel.includes("price_index") && data && typeof data === "object") {
        const item = data as Record<string, unknown>;
        const px = Number(item.price ?? item.index_price);
        const ts = Number(item.timestamp ?? this.now());
        if (Number.isFinite(px) && px > 0) this.currentSpot = { px, ts };
        return;
      }
      if (!channel.includes("markprice.options")) return;
      const updates = Array.isArray(data) ? data : [data];
      for (const update of updates) {
        if (!update || typeof update !== "object") continue;
        const item = update as Record<string, unknown>;
        const name = String(item.instrument_name ?? item.instrument ?? "");
        const markIv = Number(item.mark_iv ?? item.iv);
        if (!name || !Number.isFinite(markIv) || markIv <= 0) continue;
        const existing = this.summaries.get(name);
        this.summaries.set(name, {
          instrument_name: name,
          mark_iv: markIv,
          ...(Number.isFinite(Number(item.underlying_price)) ? { underlying_price: Number(item.underlying_price) } : {}),
          ...(existing?.estimated_delivery_price ? { estimated_delivery_price: existing.estimated_delivery_price } : {}),
          creation_timestamp: Number(item.timestamp ?? this.now()),
        });
      }
      this.rebuildSurface();
    } catch (error) {
      this.logFailure("websocket_parse", error);
    }
  }

  private logFailure(operation: string, error: unknown): void {
    this.logger.warn({ source: this.name, operation, error: error instanceof Error ? error.message : String(error) }, "Vol source operation failed");
  }
}
