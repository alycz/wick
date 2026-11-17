import type { PricerMarket } from "../../packages/shared/src/types.js";

export interface DemoHealth {
  ok?: boolean;
  chainConfigured?: boolean;
  indexerConfigured?: boolean;
  markAgeMs?: number;
  indexerEventAgeMs?: number;
  streamEventAgeMs?: number;
  streamEvidencePresent?: boolean;
}

export interface DemoFeedEvent { blockTime: number; provenance?: string }
export interface DemoSnapshot {
  health: DemoHealth;
  markets: PricerMarket[];
  feed: DemoFeedEvent[];
  vaultAmountE6: bigint;
  keeperLamports: number;
  treasuryLamports: number;
  nowMs: number;
}

export interface DemoCheckResult {
  ok: true;
  liveMarket: string;
  markAgeMs: number;
  eventAgeMs: number;
  vaultBalanceE6: string;
  keeperSol: number;
  treasurySol: number;
}

export function evaluateDemoSnapshot(snapshot: DemoSnapshot): DemoCheckResult {
  const failures: string[] = [];
  const markAge = snapshot.health.markAgeMs;
  if (!snapshot.health.ok) failures.push("backend /health is not ok");
  if (!snapshot.health.chainConfigured) failures.push("backend chain adapter is not configured");
  if (!snapshot.health.indexerConfigured) failures.push("QuickNode indexer is not configured");
  if (!snapshot.health.streamEvidencePresent) failures.push("no verified QuickNode Stream event has been indexed");
  if (markAge === undefined || markAge >= 6_000) failures.push(`latest on-chain mark is stale (${markAge ?? "missing"}ms)`);

  const live = snapshot.markets
    .filter((market) => market.duration === "15m" && market.status === "open" && market.expiryTs > snapshot.nowMs)
    .sort((left, right) => left.expiryTs - right.expiryTs)[0];
  if (!live) failures.push("no live BTC 15-minute market is available");

  const streamEvents = snapshot.feed.filter((event) => event.provenance === "quicknode_stream");
  const newestEvent = streamEvents.reduce<number | undefined>((latest, event) => latest === undefined || event.blockTime > latest ? event.blockTime : latest, undefined);
  const eventAge = newestEvent === undefined ? Number.POSITIVE_INFINITY : snapshot.nowMs - newestEvent * 1_000;
  if (!Number.isFinite(eventAge) || eventAge > 60_000) failures.push(`indexer has no event in the last 60 seconds (${Number.isFinite(eventAge) ? `${eventAge}ms` : "missing"})`);
  if (snapshot.health.indexerEventAgeMs !== undefined && snapshot.health.indexerEventAgeMs > 60_000) failures.push(`health reports stale indexer event (${snapshot.health.indexerEventAgeMs}ms)`);
  if (snapshot.health.streamEventAgeMs === undefined || snapshot.health.streamEventAgeMs > 60_000) failures.push(`health has no recent QuickNode Stream event (${snapshot.health.streamEventAgeMs ?? "missing"}ms)`);

  if (snapshot.vaultAmountE6 <= 0n) failures.push("on-chain SPL vault balance is not positive");
  if (snapshot.keeperLamports < 500_000_000) failures.push("keeper has less than 0.5 devnet SOL");
  if (snapshot.treasuryLamports < 2_000_000_000) failures.push("treasury has less than 2 devnet SOL");
  if (failures.length > 0) throw new Error(`Demo check failed:\n- ${failures.join("\n- ")}`);

  return {
    ok: true,
    liveMarket: live!.symbol,
    markAgeMs: markAge!,
    eventAgeMs: eventAge,
    vaultBalanceE6: snapshot.vaultAmountE6.toString(),
    keeperSol: snapshot.keeperLamports / 1_000_000_000,
    treasurySol: snapshot.treasuryLamports / 1_000_000_000,
  };
}
