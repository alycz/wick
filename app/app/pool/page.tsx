"use client";

import { useEffect, useMemo, useState } from "react";
import { Seg } from "@/components/markets/controls";
import { WickChart } from "@/components/wick-chart";
import { useDemoAccount } from "@/components/demo-account";
import { useFeed } from "@/hooks/use-feed";
import { useWickActions } from "@/hooks/use-wick-actions";
import { backendConfigured, getLpHistory, type LpPoint } from "@/lib/api";
import { pendingRewardsE6 } from "@/lib/demo/ledger";
import { latestIndexerEventKey } from "@/lib/feed";
import { compactAddress, e6 } from "@/lib/format";
import { timeLabel, usd } from "@/lib/markets";
import "@/styles/portfolio.css";

type Tab = "stake" | "unstake" | "claim";
const POOL_EVENTS = new Set(["LpUpdated", "Staked", "Unstaked", "RewardsClaimed", "ClaimPaid"]);
/* "All" spans exactly the history on hand */
const windowsFor = (span: number) => [{ label: "1D", secs: 86_400 }, { label: "1W", secs: 604_800 }, { label: "1M", secs: 2_592_000 }, { label: "All", secs: Math.max(3_600, Math.ceil(span * 1.04)) }];
const EVENT_NAMES: Record<string, [string, string]> = {
  LpUpdated: ["Pool updated", "var(--wick)"], Staked: ["Staked", "var(--muted)"], Unstaked: ["Unstaked", "var(--muted)"],
  RewardsClaimed: ["Rewards claimed", "var(--yes-hi)"], ClaimPaid: ["Payout paid", "var(--no-hi)"], ClaimQueued: ["Payout queued", "#f2c14e"],
  PositionLiquidated: ["Liquidation", "var(--wick)"],
};

export default function PoolPage() {
  const [history, setHistory] = useState<LpPoint[]>([]);
  const [error, setError] = useState<string>();
  const [amount, setAmount] = useState(100);
  const [text, setText] = useState<string>();
  const [tab, setTab] = useState<Tab>("stake");
  const [busy, setBusy] = useState<string>();
  const [signature, setSignature] = useState<string>();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const actions = useWickActions();
  const account = useDemoAccount();
  const demoMode = actions.demo === true && account !== undefined;
  const feed = useFeed();
  const backendReady = backendConfigured();
  const refreshKey = latestIndexerEventKey(feed.events, POOL_EVENTS);
  useEffect(() => {
    const controller = new AbortController();
    if (!backendReady) {
      setError("Pool data can't load because the backend isn't configured.");
      return () => controller.abort();
    }
    void getLpHistory(controller.signal)
      .then((nextHistory) => { setHistory(nextHistory); setError(undefined); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => controller.abort();
  }, [backendReady, refreshKey, refreshNonce]);

  const latest = history.at(-1);
  const metrics = useMemo(() => {
    if (!latest) return undefined;
    const balance = e6(latest.balanceE6);
    const dayAgo = [...history].reverse().find((point) => point.blockTime <= latest.blockTime - 86_400);
    return { balance, queue: e6(latest.queueOwedE6), fees: e6(latest.feesE6), change: dayAgo ? balance - e6(dayAgo.balanceE6) : undefined };
  }, [history, latest]);
  const series = useMemo(() => history.map((point) => ({ time: point.blockTime, value: e6(point.balanceE6) })), [history]);
  const span = series.length > 1 ? series[series.length - 1]!.time - series[0]!.time : 0;
  const poolEvents = feed.events.filter((event) => EVENT_NAMES[event.name]).slice(0, 8);

  const action = async (name: string, operation: () => Promise<string>) => {
    if (!actions.client) { setError(actions.error ?? "Staking is not configured."); return; }
    setBusy(name); setError(undefined); setSignature(undefined);
    try { setSignature(await operation()); setRefreshNonce((value) => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(undefined); }
  };
  /* the demo account stakes against its own ledger, so it doesn't wait on pool history */
  const disabled = busy !== undefined || !actions.client || (!demoMode && (!backendReady || !metrics));
  const demoBalances = demoMode ? {
    wallet: e6(account.ledger.wickedE6), staked: e6(account.ledger.stakedE6), rewards: Number(pendingRewardsE6(account.ledger)) / 1_000_000,
  } : undefined;
  const wicked = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const amountE6 = BigInt(Math.round(amount * 1_000_000));

  return <div className="pl-page">
    <header className="pf-head">
      <div><h1>Pool</h1><p>Losing trades fill the pool and winning trades are paid from it. Stake $WICKED to earn the surplus once the payout queue is clear.</p></div>
    </header>
    {(error || signature || (backendReady && !actions.client && !demoMode)) && <div className="pf-alerts">
      {error && <p className="pf-note pf-err" role="alert">{error}</p>}
      {backendReady && !actions.client && !demoMode && <p className="pf-note">{actions.error ?? "Staking is not configured."}</p>}
      {signature && <p className="pf-note pf-ok" role="status">{demoMode
        ? `Local demo complete · ${signature} · no network transaction`
        : `Devnet transaction confirmed · ${compactAddress(signature)}`}</p>}
    </div>}

    <section className="pf-stats" aria-label="Pool metrics">
      <div><span>Pool liquidity</span><b>{metrics ? usd(metrics.balance) : "—"}</b>
        <small className={metrics?.change === undefined ? "" : metrics.change >= 0 ? "up" : "down"}>{metrics?.change === undefined ? "Available to pay winners" : `${metrics.change >= 0 ? "+" : "−"}${usd(Math.abs(metrics.change))} in 24h`}</small></div>
      <div><span>Payout queue</span><b>{metrics ? usd(metrics.queue) : "—"}</b><small>{metrics && metrics.queue > 0 ? "Rewards paused until it clears" : "Clear"}</small></div>
      <div><span>Fees earned</span><b>{metrics ? usd(metrics.fees) : "—"}</b><small>All time</small></div>
      <div><span>Snapshots</span><b>{history.length}</b><small>From on-chain events</small></div>
    </section>

    <div className="pl-grid">
      <div className="pl-main">
        <section className="card pl-chart" aria-label="Pool liquidity chart">
          <WickChart key={span ? "ready" : "empty"} series={[{ id: "pool", label: "Pool liquidity", color: "#5fd4cc", data: series }]} format="usd" windows={windowsFor(span)} height={260} initialWindow={windowsFor(span)[3]!.secs}
            formatTime={(time) => new Date(time * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
        </section>
        <div className="flow">
          <div><span>1 · Trades lose</span><b>Losses go to the pool</b><p>Margin from losing and liquidated positions becomes pool liquidity. No outside deposit is needed.</p></div>
          <div><span>2 · Trades win</span><b>Winners are paid in order</b><p>If the pool is short, payouts wait in a first-in, first-out queue until it refills.</p></div>
          <div><span>3 · Queue clears</span><b>Stakers earn the rest</b><p>Fees and surplus go to $WICKED stakers only while the queue is empty.</p></div>
        </div>
        <section aria-label="Recent pool activity">
          <h2 className="pl-h2">Recent pool activity</h2>
          {poolEvents.length === 0 ? <p className="pf-empty">No pool events yet.</p> : poolEvents.map((event) => {
            const [name, color] = EVENT_NAMES[event.name]!;
            return <div className="ev" key={`${event.signature}:${event.eventIndex}`}>
              <i style={{ background: color }} /><b>{name}</b><span className="mu">{compactAddress(event.signature)}</span><small>{timeLabel(event.blockTime * 1000)}</small>
            </div>;
          })}
        </section>
      </div>
      <aside className="ticket"><div className="card pl-card" aria-label="Stake $WICKED">
        <Seg className="pl-tabs" label="Staking action" value={tab} onChange={setTab}
          options={[{ value: "stake", label: "Stake" }, { value: "unstake", label: "Unstake" }, { value: "claim", label: "Claim" }]} />
        {demoBalances && <div className="pl-bal" aria-label="Your $WICKED">
          <div><span>In wallet</span><b>{wicked(demoBalances.wallet)} $WICKED</b></div>
          <div><span>Staked</span><b>{wicked(demoBalances.staked)} $WICKED</b></div>
          <div><span>Rewards</span><b className={demoBalances.rewards > 0 ? "up" : ""}>{usd(demoBalances.rewards)}</b></div>
        </div>}
        {tab === "claim" ? <>
          <div className="pf-val"><span>Rewards</span><b>$WICKED fee share</b>
            <span>{metrics && metrics.queue > 0 ? `Rewards resume once the ${usd(metrics.queue)} payout queue is cleared.` : "The payout queue is clear, so rewards are flowing."}</span></div>
          <button type="button" className="cta" disabled={disabled} onClick={() => void action("claim", () => actions.client!.claimRewards())}>{busy === "claim" ? "Confirming…" : "Claim rewards"}</button>
        </> : <>
          <div className="amt">
            <label htmlFor="pl-amt">Amount</label>
            <input id="pl-amt" inputMode="decimal" aria-label="Amount in WICKED" value={text ?? amount.toLocaleString("en-US")}
              onFocus={() => setText(String(amount))} onChange={(event) => setText(event.target.value.replace(/[^0-9.]/g, ""))}
              onBlur={() => { if (text !== undefined) setAmount(Math.max(0, Number(text) || 0)); setText(undefined); }} />
          </div>
          <div className="pl-unit">{demoBalances && <button type="button" className="pl-max" onClick={() => setAmount(Math.floor((tab === "stake" ? demoBalances.wallet : demoBalances.staked) * 100) / 100)}>Max</button>}<span>$WICKED</span></div>
          <button type="button" className="cta" disabled={disabled || amount <= 0}
            onClick={() => void action(tab, () => tab === "stake" ? actions.client!.stake(amountE6) : actions.client!.unstake(amountE6))}>
            {busy === tab ? "Confirming…" : `${tab === "stake" ? "Stake" : "Unstake"} ${amount.toLocaleString("en-US")} $WICKED`}
          </button>
        </>}
        <p className="fine">{demoMode
          ? "Browser-only practice. Local stake actions create receipts, but the demo does not fabricate staking rewards or network transfers."
          : "$WICKED is emitted to losing traders on the pool's high-water-mark curve. Rewards only pay out while the payout queue is empty."}</p>
      </div></aside>
    </div>
  </div>;
}
