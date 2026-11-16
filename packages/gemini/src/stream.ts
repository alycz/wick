import type { GeminiQuote } from "@wick/shared";
import { GeminiClient } from "./client.js";
import { parseBookTicker, parseContractStatus, quoteFromContract } from "./quotes.js";
import type { ContractStatusMessage } from "./schemas.js";

interface MessageEventLike { data: unknown }
interface CloseEventLike { code?: number; reason?: string }
interface WebSocketLike {
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: MessageEventLike) => void): void;
  addEventListener(type: "error", listener: (error: unknown) => void): void;
  addEventListener(type: "close", listener: (event: CloseEventLike) => void): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface GeminiQuoteStreamOptions {
  symbols: string[];
  client?: GeminiClient;
  wsUrl?: string;
  pollIntervalMs?: number;
  wsFactory?: (url: string) => WebSocketLike;
  onQuote: (symbol: string, quote: GeminiQuote) => void;
  onStatus?: (status: ContractStatusMessage) => void;
  logger?: Pick<Console, "info" | "warn">;
}

export class GeminiQuoteStream {
  private readonly options: GeminiQuoteStreamOptions;
  private readonly client: GeminiClient;
  private socket: WebSocketLike | undefined;
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private fallbackStarted = false;

  constructor(options: GeminiQuoteStreamOptions) {
    if (options.symbols.length === 0) throw new RangeError("at least one Gemini symbol is required");
    this.options = options;
    this.client = options.client ?? new GeminiClient();
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    const factory = this.options.wsFactory ?? ((url: string) => {
      if (typeof WebSocket === "undefined") throw new Error("WebSocket is unavailable in this runtime");
      return new WebSocket(url) as unknown as WebSocketLike;
    });
    try {
      const socket = factory(this.options.wsUrl ?? process.env.GEMINI_WS ?? "wss://ws.gemini.com");
      this.socket = socket;
      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({
          id: "wick-quotes",
          method: "SUBSCRIBE",
          params: [...this.options.symbols.map((symbol) => `${symbol}@bookTicker`), "contractStatus"],
        }));
        // Seed consumers immediately. A quiet but valid book may not produce a
        // websocket delta for several seconds after a successful subscription.
        void this.pollOnce().catch((error: unknown) => {
          this.options.logger?.warn(`initial Gemini REST quote snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
        });
      });
      socket.addEventListener("message", (event) => this.handleMessage(event.data));
      socket.addEventListener("error", (error) => this.startFallback(`websocket error: ${String(error)}`));
      socket.addEventListener("close", (event) => this.startFallback(`websocket closed ${event.code ?? ""} ${event.reason ?? ""}`.trim()));
    } catch (error) {
      this.startFallback(`websocket unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  stop(): void {
    this.stopped = true;
    this.socket?.close(1000, "Wick shutdown");
    this.socket = undefined;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
  }

  private handleMessage(raw: unknown): void {
    if (this.stopped) return;
    let parsed: unknown;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw instanceof ArrayBuffer ? JSON.parse(new TextDecoder().decode(raw)) : raw;
      if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
        this.startFallback(`Gemini rejected subscription: ${JSON.stringify((parsed as { error: unknown }).error)}`);
        return;
      }
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "id" in parsed &&
        ("result" in parsed || "status" in parsed)
      ) {
        this.options.logger?.info("Gemini websocket subscription acknowledged");
        return;
      }
      if (typeof parsed === "object" && parsed !== null && (parsed as { e?: unknown }).e === "contractStatus") {
        this.options.onStatus?.(parseContractStatus(parsed));
        return;
      }
      const { symbol, quote } = parseBookTicker(parsed);
      const requested = this.options.symbols.find((candidate) => candidate.toLowerCase() === symbol.toLowerCase());
      if (requested) this.options.onQuote(requested, quote);
    } catch (error) {
      this.options.logger?.warn(`ignored invalid Gemini websocket message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private startFallback(reason: string): void {
    if (this.stopped || this.fallbackStarted) return;
    this.fallbackStarted = true;
    this.options.logger?.warn(`${reason}; falling back to Gemini REST polling`);
    void this.poll();
  }

  private async poll(): Promise<void> {
    if (this.stopped) return;
    try {
      await this.pollOnce();
    } catch (error) {
      this.options.logger?.warn(`Gemini REST quote poll failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (!this.stopped) this.pollTimer = setTimeout(() => void this.poll(), this.options.pollIntervalMs ?? 2_000);
    }
  }

  private async pollOnce(): Promise<void> {
    const response = await this.client.listEvents({ status: "active", search: "BTC", limit: 500 });
    if (this.stopped) return;
    const bySymbol = new Map(response.data.flatMap((event) => event.contracts.map((contract) => [contract.instrumentSymbol, contract] as const)));
    const now = Date.now();
    for (const symbol of this.options.symbols) {
      const contract = bySymbol.get(symbol);
      if (contract) this.options.onQuote(symbol, quoteFromContract(contract, now));
    }
  }
}
