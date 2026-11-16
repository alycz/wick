"use client";

import { useEffect, useMemo, useState } from "react";
import { PoolChart } from "@/components/line-chart";
import { backendConfigured, getLpHistory, type LpPoint } from "@/lib/api";
import { chainConfigurationError } from "@/lib/chain";
import { dollars, e6 } from "@/lib/format";

export default function PoolPage() {
  const [history, setHistory] = useState<LpPoint[]>([]);
  const [error, setError] = useState<string>();
  const [amount, setAmount] = useState(100);
  useEffect(() => {
    const controller = new AbortController();
    if (!backendConfigured()) {
      setError("Backend is not configured. No pool data can be verified.");
      return () => controller.abort();
    }
    void getLpHistory(controller.signal).then(setHistory).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => controller.abort();
  }, []);
  const latest = history.at(-1);
  const metrics = useMemo(() => latest ? ({ balance: e6(latest.balanceE6), queue: e6(latest.queueOwedE6), fees: e6(latest.feesE6) }) : undefined, [latest]);
  const action = () => setError(chainConfigurationError());
  return <div className="page-stack">
    <div className="page-header"><p className="eyebrow">SELF-BOOTSTRAPPING LIQUIDITY</p><h1>Martingaler pool</h1><p>Trader losses capitalize the pool. Fees and surplus accrue to $WICKED stakers after queued payouts.</p></div>
    {error && <div className="notice" role="alert">{error}</div>}
    <div className="pool-metrics"><div className="panel"><span>LP balance</span><b>{metrics ? dollars(metrics.balance, 2) : "—"}</b></div><div className="panel"><span>Queue owed</span><b>{metrics ? dollars(metrics.queue, 2) : "—"}</b></div><div className="panel"><span>Total fees</span><b>{metrics ? dollars(metrics.fees, 2) : "—"}</b></div><div className="panel"><span>Emissions</span><b>$WICKED</b></div></div>
    <section className="panel chart-panel"><div className="section-heading"><div>Pool balance</div><span className="muted">Verified on-chain snapshots</span></div><PoolChart points={history} /></section>
    <section className="panel staking-panel"><div><p className="eyebrow">FEE SHARE</p><h2>Stake $WICKED</h2><p>Rewards distribute only after the payout queue is empty. Tokens are emitted to losing traders using the pool high-watermark curve.</p></div><div className="stake-controls"><label>Amount<input type="number" min="1" value={amount} onChange={(event) => setAmount(Math.max(1, Number(event.target.value)))} /></label><div><button className="primary-button" onClick={action} type="button">Stake</button><button className="secondary-button" onClick={action} type="button">Unstake</button><button className="secondary-button" onClick={action} type="button">Claim rewards</button></div></div></section>
  </div>;
}
