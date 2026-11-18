import {
  geminiEventSchema,
  geminiEventsResponseSchema,
  geminiSpotTickerSchema,
  geminiStrikeSchema,
  type GeminiEvent,
  type GeminiEventsResponse,
  type GeminiStrike,
} from "./schemas.js";

export interface GeminiClientOptions {
  restUrl?: string;
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
  maxAttempts?: number;
}

export interface ListEventsOptions {
  status?: "approved" | "active" | "closed" | "under_review" | "settled" | "invalid";
  search?: string;
  limit?: number;
  offset?: number;
}

/** Fetch the whole active BTC catalog even if Gemini caps each page below the requested size. */
export async function listActiveBtcEvents(client: Pick<GeminiClient, "listEvents">): Promise<GeminiEvent[]> {
  const events: GeminiEvent[] = [];
  let offset = 0;
  for (;;) {
    const page = await client.listEvents({ status: "active", search: "BTC", limit: 500, offset });
    if (page.pagination.offset !== offset) throw new Error("Gemini returned an unexpected events offset");
    events.push(...page.data);
    offset += page.data.length;
    if (offset >= page.pagination.total) return events;
    if (!page.data.length) throw new Error("Gemini returned an incomplete events page");
  }
}

export interface SpotTicker {
  bid: number;
  ask: number;
  last: number;
  ts: number;
}

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("aborted"));
    }, { once: true });
  });

export class GeminiClient {
  readonly restUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;
  private readonly maxAttempts: number;

  constructor(options: GeminiClientOptions = {}) {
    this.restUrl = (options.restUrl ?? process.env.GEMINI_REST ?? "https://api.gemini.com").replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 8_000;
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  private async request(path: string, signal?: AbortSignal): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const timeout = AbortSignal.timeout(this.requestTimeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      try {
        const response = await this.fetchImpl(`${this.restUrl}${path}`, {
          headers: { accept: "application/json", "user-agent": "wick-markets/0.0.0" },
          signal: combined,
        });
        if (!response.ok) {
          if (response.status < 500 && response.status !== 429) throw new Error(`Gemini HTTP ${response.status}`);
          throw new Error(`Gemini retryable HTTP ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        lastError = error;
        if (signal?.aborted || attempt === this.maxAttempts) break;
        await delay(250 * 2 ** (attempt - 1), signal);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Gemini request failed");
  }

  async listEvents(options: ListEventsOptions = {}, signal?: AbortSignal): Promise<GeminiEventsResponse> {
    const params = new URLSearchParams({
      status: options.status ?? "active",
      search: options.search ?? "BTC",
      limit: String(options.limit ?? 500),
      offset: String(options.offset ?? 0),
    });
    return geminiEventsResponseSchema.parse(await this.request(`/v1/prediction-markets/events?${params}`, signal));
  }

  async getEvent(eventTicker: string, signal?: AbortSignal): Promise<GeminiEvent> {
    return geminiEventSchema.parse(await this.request(`/v1/prediction-markets/events/${encodeURIComponent(eventTicker)}`, signal));
  }

  async getStrike(eventTicker: string, signal?: AbortSignal): Promise<GeminiStrike> {
    return geminiStrikeSchema.parse(await this.request(`/v1/prediction-markets/events/${encodeURIComponent(eventTicker)}/strike`, signal));
  }

  async getSpot(signal?: AbortSignal): Promise<SpotTicker> {
    const ticker = geminiSpotTickerSchema.parse(await this.request("/v1/pubticker/btcusd", signal));
    return { bid: Number(ticker.bid), ask: Number(ticker.ask), last: Number(ticker.last), ts: ticker.volume.timestamp };
  }

  async readSettlement(eventTicker: string, signal?: AbortSignal): Promise<GeminiEvent | undefined> {
    const event = await this.getEvent(eventTicker, signal);
    return event.status === "settled" || event.status === "invalid" ? event : undefined;
  }

  async waitForSettlement(eventTicker: string, options: { intervalMs?: number; signal?: AbortSignal } = {}): Promise<GeminiEvent> {
    const intervalMs = options.intervalMs ?? 3_000;
    while (!options.signal?.aborted) {
      const settled = await this.readSettlement(eventTicker, options.signal);
      if (settled) return settled;
      await delay(intervalMs, options.signal);
    }
    throw options.signal.reason ?? new Error("settlement wait aborted");
  }
}
