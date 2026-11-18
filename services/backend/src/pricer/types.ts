import type { GeminiEvent, GeminiEventsResponse, GeminiStrike } from "@wick/gemini";
import type { GeminiQuote, PricerMarket, PositionSide } from "@wick/shared";
import type { VolSource } from "@wick/vol";

export interface BackendLogger {
  debug?(fields: Record<string, unknown>, message: string): void;
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

export interface GeminiGateway {
  listEvents(options?: { status?: "active"; search?: string; limit?: number; offset?: number }, signal?: AbortSignal): Promise<GeminiEventsResponse>;
  getStrike(eventTicker: string, signal?: AbortSignal): Promise<GeminiStrike>;
  getEvent(eventTicker: string, signal?: AbortSignal): Promise<GeminiEvent>;
}

export interface QuoteStream {
  start(): void;
  stop(): void;
}

export interface QuoteStreamFactoryOptions {
  symbols: string[];
  onQuote: (symbol: string, quote: GeminiQuote) => void;
  onStatus: () => void;
}

export type QuoteStreamFactory = (options: QuoteStreamFactoryOptions) => QuoteStream;

export interface CreateMarketRequest {
  symbol: string;
  kind: "up_down" | "ladder";
  strikeUsdE6: bigint;
  openTs: number;
  expiryTs: number;
  cutoffSecs: number;
  halfSpreadE6: number;
}

export interface MarkUpdateRequest {
  symbol: string;
  markE6: number;
  maxLeverage: number;
}

export interface OpenPositionRef {
  address: string;
  symbol: string;
  side: PositionSide;
  liqMarkE6: number;
}

export type SettlementMarketStatus = "open" | "halted" | "expired" | "settled" | "invalid";

export interface SettlementMarketRef {
  symbol: string;
  expiryTs: number;
  status: SettlementMarketStatus;
}

/**
 * Boundary around all on-chain writes and reads. WP5 does not silently replace
 * an unavailable Anchor client with fake success; production must provide a
 * configured implementation backed by the deployed Wick program.
 */
export interface ChainPort {
  configured(): boolean;
  marketExists(symbol: string, signal?: AbortSignal): Promise<boolean>;
  createMarket(request: CreateMarketRequest, signal?: AbortSignal): Promise<string>;
  updateMarks(requests: readonly MarkUpdateRequest[], options: { priorityFeeMicroLamports: number; signal?: AbortSignal }): Promise<string>;
  listOpenPositions(signal?: AbortSignal): Promise<readonly OpenPositionRef[]>;
  listSettlementMarkets(signal?: AbortSignal): Promise<readonly SettlementMarketRef[]>;
  liquidate(positionAddress: string, signal?: AbortSignal): Promise<string>;
  settleMarket(symbol: string, outcome: "yes" | "no", settlementValueE6: bigint, signal?: AbortSignal): Promise<string>;
  voidMarket(symbol: string, signal?: AbortSignal): Promise<string>;
  settleOpenPositions(symbol: string, signal?: AbortSignal): Promise<readonly string[]>;
  claimQueue(signal?: AbortSignal): Promise<readonly string[]>;
  close?(): Promise<void> | void;
}

export interface PricerSnapshot {
  markets: PricerMarket[];
  unpricedMarkets: Pick<PricerMarket, "symbol" | "eventTicker" | "strike" | "expiryTs">[];
  volSource: VolSource["name"] | "unavailable";
  volHealthy: boolean;
  chainConfigured: boolean;
  running: boolean;
  lastDiscoveryAt?: number;
  lastMarkAt?: number;
  lastPricingAt?: number;
  lastError?: string;
}
