import { marketsResponseSchema, type ArchivedLadderContract, type ArchivedUpDownContract, type IndexedEvent, type MarketHistoryPoint, type PositionView, type PricerMarket } from "@wick/shared";
import { z } from "zod";

/** Accepts "host", "host/" or "https://host"; a bare host gets https://. */
export function normalizeBackendUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim().replace(/\/+$/, "");
  if (!value) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

const BACKEND = normalizeBackendUrl(process.env.NEXT_PUBLIC_BACKEND_URL);

const MARKET_DATA = normalizeBackendUrl(process.env.NEXT_PUBLIC_MARKET_DATA_URL) || BACKEND;

const historySchema = z.array(z.object({
  ts: z.number(),
  theo: z.number(),
  reconstructed: z.boolean().optional(),
  geminiMid: z.number().optional(),
  geminiBid: z.number().min(0).max(1).optional(),
  geminiAsk: z.number().min(0).max(1).optional(),
  spot: z.number(),
}));

const archivedContractSchema = z.object({
  symbol: z.string(),
  strike: z.number(),
  expiryTs: z.number(),
});
const upDownContractsSchema = z.array(archivedContractSchema.extend({ duration: z.string(), openTs: z.number() }));

const positionSchema = z.object({
  address: z.string(), owner: z.string(), market: z.string(), side: z.enum(["yes", "no"]),
  marginE6: z.union([z.string(), z.number()]).transform(String), leverage: z.number(), entryE6: z.number(),
  contractsE6: z.union([z.string(), z.number()]).transform(String), liqMarkE6: z.number(),
  status: z.enum(["open", "closed", "liquidated", "settled"]),
  realizedPnlE6: z.union([z.string(), z.number()]).transform(String).optional(),
  paidE6: z.union([z.string(), z.number()]).transform(String).optional(),
}).passthrough();

const claimSchema = z.object({
  address: z.string(), claimIndex: z.union([z.string(), z.number()]).transform(String), owner: z.string(),
  amountE6: z.union([z.string(), z.number()]).transform(String),
  paidE6: z.union([z.string(), z.number()]).transform(String), status: z.string(),
}).passthrough();

const lpPointSchema = z.object({
  blockTime: z.number(), balanceE6: z.union([z.string(), z.number()]).transform(String),
  queueOwedE6: z.union([z.string(), z.number()]).transform(String),
  feesE6: z.union([z.string(), z.number()]).transform(String), signature: z.string(),
});

export const indexedEventSchema = z.object({
  signature: z.string().min(1), eventIndex: z.number().int().nonnegative(), slot: z.number().int().nonnegative(), blockTime: z.number().int().nonnegative(),
  name: z.string().min(1), data: z.record(z.unknown()), provenance: z.enum(["quicknode_stream", "rpc_reconcile"]),
});

const healthSchema = z.object({
  ok: z.boolean(),
  chainConfigured: z.boolean(),
  volHealthy: z.boolean(),
  volSource: z.enum(["deribit", "derive", "realized", "unavailable"]),
  geminiHealthy: z.boolean().optional(),
  unpricedMarkets: z.array(archivedContractSchema.extend({ eventTicker: z.string() })).optional(),
  lastTickTs: z.number().optional(),
  markAgeMs: z.number().nonnegative().optional(),
  pricingAgeMs: z.number().nonnegative().optional(),
  discoveryAgeMs: z.number().nonnegative().optional(),
}).passthrough();

export interface ClaimView { address: string; claimIndex: string; owner: string; amountE6: string; paidE6: string; status: string }
export interface LpPoint { blockTime: number; balanceE6: string; queueOwedE6: string; feesE6: string; signature: string }
export type HealthView = z.infer<typeof healthSchema>;

export function backendConfigured(): boolean { return BACKEND.length > 0; }
export function marketDataConfigured(): boolean { return MARKET_DATA.length > 0; }
export function backendUrl(path: string, marketData = false): string {
  const base = marketData ? MARKET_DATA : BACKEND;
  if (!base) throw new Error("Backend is not configured. Set NEXT_PUBLIC_BACKEND_URL.");
  return `${base}${path}`;
}

async function json(path: string, signal?: AbortSignal, marketData = false): Promise<unknown> {
  const response = await fetch(backendUrl(path, marketData), { cache: "no-store", ...(signal ? { signal } : {}) });
  if (!response.ok) throw new Error(`Backend request failed (${response.status})`);
  return response.json();
}

export async function getMarkets(signal?: AbortSignal): Promise<PricerMarket[]> {
  return marketsResponseSchema.parse(await json("/markets", signal, true)) as unknown as PricerMarket[];
}
export async function getHistory(symbol: string, signal?: AbortSignal): Promise<MarketHistoryPoint[]> {
  return historySchema.parse(await json(`/markets/${encodeURIComponent(symbol)}/history`, signal, true)) as unknown as MarketHistoryPoint[];
}
export async function getUpDownContracts(signal?: AbortSignal): Promise<ArchivedUpDownContract[]> {
  return upDownContractsSchema.parse(await json("/markets/up-down-history", signal, true));
}
export async function getLadderContracts(signal?: AbortSignal): Promise<ArchivedLadderContract[]> {
  return z.array(archivedContractSchema).parse(await json("/markets/ladder-history", signal, true));
}
export async function getPositions(owner: string, signal?: AbortSignal): Promise<Array<PositionView & Record<string, unknown>>> {
  return z.array(positionSchema).parse(await json(`/positions?owner=${encodeURIComponent(owner)}`, signal)) as Array<PositionView & Record<string, unknown>>;
}
export async function getClaims(owner: string, signal?: AbortSignal): Promise<ClaimView[]> {
  return z.array(claimSchema).parse(await json(`/claims?owner=${encodeURIComponent(owner)}`, signal));
}
export async function getLpHistory(signal?: AbortSignal): Promise<LpPoint[]> {
  return z.array(lpPointSchema).parse(await json("/lp/history", signal));
}
export async function getFeed(signal?: AbortSignal): Promise<IndexedEvent[]> {
  return z.array(indexedEventSchema).parse(await json("/feed?limit=50", signal));
}
export function parseIndexedEvent(value: unknown): IndexedEvent { return indexedEventSchema.parse(value); }
export async function getHealth(signal?: AbortSignal, marketData = false): Promise<HealthView> {
  return healthSchema.parse(await json("/health", signal, marketData));
}
