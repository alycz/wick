"use client";

import { useEffect, useMemo, useState } from "react";
import { PoolChart } from "@/components/line-chart";
import { useFeed } from "@/hooks/use-feed";
import { useWickActions } from "@/hooks/use-wick-actions";
import { backendConfigured, getLpHistory, type LpPoint } from "@/lib/api";
import { latestIndexerEventKey } from "@/lib/feed";
import { compactAddress, dollars, e6 } from "@/lib/format";

const POOL_EVENTS = new Set(["LpUpdated", "Staked", "Unstaked", "RewardsClaimed", "ClaimPaid"]);

export default function PoolPage() {
  const [history, setHistory] = useState<LpPoint[]>([]);
  const [error, setError] = useState<string>();
  const [amount, setAmount] = useState(100);
  const [busy, setBusy] = useState<string>();
  const [signature, setSignature] = useState<string>();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const actions = useWickActions();
  const feed = useFeed();
  const backendReady = backendConfigured();
  const refreshKey = latestIndexerEventKey(feed.events, POOL_EVENTS);
  useEffect(() => {
    const controller = new AbortController();
    if (!backendReady) {
      setError("Backend is not configured. No pool data can be verified.");
      return () => controller.abort();
    }
    void getLpHistory(controller.signal)
      .then((nextHistory) => { setHistory(nextHistory); setError(undefined); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => controller.abort();
  }, [backendReady, refreshKey, refreshNonce]);
  const latest = history.at(-1);
  const metrics = useMemo(() => latest ? ({ balance: e6(latest.balanceE6), queue: e6(latest.queueOwedE6), fees: e6(latest.feesE6) }) : undefined, [latest]);
  const action = async (name: string, operation: () => Promise<string>) => {
    if (!actions.client) { setError(actions.error ?? "Staking is not configured."); return; }
    setBusy(name); setError(undefined); setSignature(undefined);
    try { setSignature(await operation()); setRefreshNonce((value) => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(undefined); }
  };
  return <div className="page-stack">
    <div className="page-header"><p className="eyebrow">SELF-BOOTSTRAPPING LIQUIDITY</p><h1>Martingaler pool</h1><p>Trader losses capitalize the pool. Fees and surplus accrue to $WICKED stakers after queued payouts.</p></div>
    {error && <div className="notice" role="alert">{error}</div>}
    {backendReady && !actions.client && <div className="notice">{actions.error ?? "Staking is not configured."}</div>}
    {signature && <div className="notice" role="status">Confirmed on devnet · {compactAddress(signature)}</div>}
    <div className="pool-metrics"><div className="panel"><span>LP balance</span><b>{metrics ? dollars(metrics.balance, 2) : "—"}</b></div><div className="panel"><span>Queue owed</span><b>{metrics ? dollars(metrics.queue, 2) : "—"}</b></div><div className="panel"><span>Total fees</span><b>{metrics ? dollars(metrics.fees, 2) : "—"}</b></div><div className="panel"><span>Emissions</span><b>$WICKED</b></div></div>
    <section className="panel chart-panel"><div className="section-heading"><div>Pool balance</div><span className="muted">Verified on-chain snapshots</span></div><PoolChart points={history} /></section>
    <section className="panel staking-panel"><div><p className="eyebrow">FEE SHARE</p><h2>Stake $WICKED</h2><p>Rewards distribute only after the payout queue is empty. Tokens are emitted to losing traders using the pool high-watermark curve.</p></div><div className="stake-controls"><label>Amount<input type="number" min="1" value={amount} onChange={(event) => setAmount(Math.max(1, Number(event.target.value)))} /></label><div><button className="primary-button" disabled={busy !== undefined || !backendReady || !metrics || !actions.client} onClick={() => void action("stake", () => actions.client!.stake(BigInt(Math.round(amount * 1_000_000))))} type="button">{busy === "stake" ? "Confirming…" : "Stake"}</button><button className="secondary-button" disabled={busy !== undefined || !backendReady || !metrics || !actions.client} onClick={() => void action("unstake", () => actions.client!.unstake(BigInt(Math.round(amount * 1_000_000))))} type="button">{busy === "unstake" ? "Confirming…" : "Unstake"}</button><button className="secondary-button" disabled={busy !== undefined || !backendReady || !metrics || !actions.client} onClick={() => void action("claim", () => actions.client!.claimRewards())} type="button">{busy === "claim" ? "Confirming…" : "Claim rewards"}</button></div></div></section>
  </div>;
}
