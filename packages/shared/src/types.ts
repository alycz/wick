export type MarketKind = "up_down" | "ladder";
export type MarketStatus = "open" | "halted" | "expired" | "settled" | "invalid";
export type PositionSide = "yes" | "no";
export type PositionStatus = "open" | "closed" | "liquidated" | "settled";
export type VolSourceName = "deribit" | "derive" | "realized";

export interface GeminiQuote {
  bid?: number;
  ask?: number;
  mid?: number;
  last?: number;
  ts: number;
}

export interface PricerMarket {
  symbol: string;
  eventTicker: string;
  kind: MarketKind;
  duration: string;
  title: string;
  strike: number;
  openTs: number;
  expiryTs: number;
  spot: number;
  theo: number;
  gemini: GeminiQuote;
  edge?: number;
  maxLeverage: number;
  status: MarketStatus;
  volSource: VolSourceName;
}

export interface MarketHistoryPoint {
  ts: number;
  theo: number;
  geminiMid?: number;
  spot: number;
}

export interface HealthResponse {
  ok: boolean;
  cluster: "devnet";
  volSource: VolSourceName;
  volHealthy: boolean;
  markAgeMs?: number;
  indexerEventAgeMs?: number;
  version: string;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface IndexedEvent {
  signature: string;
  eventIndex: number;
  slot: number;
  blockTime: number;
  name: string;
  data: Record<string, unknown>;
}

export interface PositionView {
  address: string;
  owner: string;
  market: string;
  side: PositionSide;
  marginE6: string;
  leverage: number;
  entryE6: number;
  contractsE6: string;
  liqMarkE6: number;
  status: PositionStatus;
}
