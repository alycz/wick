import { marketsResponseSchema, type IndexedEvent, type MarketHistoryPoint, type PositionView, type PricerMarket } from "@wick/shared";
import { z } from "zod";

const BACKEND = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");

const historySchema = z.array(z.object({
  ts: z.number(),
  theo: z.number(),
  geminiMid: z.number().optional(),
  spot: z.number(),
}));

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

const eventSchema = z.object({
  signature: z.string(), eventIndex: z.number(), slot: z.number(), blockTime: z.number(),
  name: z.string(), data: z.record(z.unknown()), provenance: z.enum(["quicknode_stream", "rpc_reconcile"]),
});

const healthSchema = z.object({
  ok: z.boolean(),
  chainConfigured: z.boolean(),
  volHealthy: z.boolean(),
  volSource: z.enum(["deribit", "derive", "realized"]),
  geminiHealthy: z.boolean().optional(),
  lastTickTs: z.number().optional(),
}).passthrough();

export interface ClaimView { address: string; claimIndex: string; owner: string; amountE6: string; paidE6: string; status: string }
export interface LpPoint { blockTime: number; balanceE6: string; queueOwedE6: string; feesE6: string; signature: string }
export type HealthView = z.infer<typeof healthSchema>;

export function backendConfigured(): boolean { return BACKEND.length > 0; }
export function backendUrl(path: string): string {
  if (!BACKEND) throw new Error("Backend is not configured. Set NEXT_PUBLIC_BACKEND_URL.");
  return `${BACKEND}${path}`;
}

async function json(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(backendUrl(path), { cache: "no-store", ...(signal ? { signal } : {}) });
  if (!response.ok) throw new Error(`Backend request failed (${response.status})`);
  return response.json();
}

export async function getMarkets(signal?: AbortSignal): Promise<PricerMarket[]> {
  return marketsResponseSchema.parse(await json("/markets", signal)) as unknown as PricerMarket[];
}
export async function getHistory(symbol: string, signal?: AbortSignal): Promise<MarketHistoryPoint[]> {
  return historySchema.parse(await json(`/markets/${encodeURIComponent(symbol)}/history`, signal)) as unknown as MarketHistoryPoint[];
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
  return z.array(eventSchema).parse(await json("/feed?limit=50", signal));
}
export async function getHealth(signal?: AbortSignal): Promise<HealthView> {
  return healthSchema.parse(await json("/health", signal));
}
