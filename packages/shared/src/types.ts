export type MarketKind = "up_down" | "ladder";
export type MarketStatus = "open" | "halted" | "expired" | "settled" | "invalid";
export type PositionSide = "yes" | "no";
export type PositionStatus = "open" | "closed" | "liquidated" | "settled";
export type VolSourceName = "deribit" | "derive" | "realized";
export type EventProvenance = "quicknode_stream" | "rpc_reconcile";

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
  reconstructed?: boolean;
  geminiMid?: number;
  geminiBid?: number;
  geminiAsk?: number;
  spot: number;
}

export type ArchivedUpDownContract = Pick<PricerMarket, "symbol" | "duration" | "strike" | "openTs" | "expiryTs">;
export type ArchivedLadderContract = Pick<PricerMarket, "symbol" | "strike" | "expiryTs">;

export interface HealthResponse {
  ok: boolean;
  cluster: "devnet";
  volSource: VolSourceName;
  volHealthy: boolean;
  markAgeMs?: number;
  indexerEventAgeMs?: number;
  streamEventAgeMs?: number;
  streamEvidencePresent?: boolean;
  pendingStreamDeliveries?: number;
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
  provenance: EventProvenance;
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
