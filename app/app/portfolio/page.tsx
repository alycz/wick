"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import type { PositionView } from "@wick/shared";
import { useDemoWallet } from "@/components/wallet-panel";
import { useFeed } from "@/hooks/use-feed";
import { useMarkets } from "@/hooks/use-markets";
import { useWickActions } from "@/hooks/use-wick-actions";
import { backendConfigured, getClaims, getPositions, type ClaimView } from "@/lib/api";
import { latestIndexerEventKey } from "@/lib/feed";
import { cents, compactAddress, dollars, e6 } from "@/lib/format";
import { calculateLivePositionPnls } from "@/lib/portfolio";

type PositionRow = PositionView & Record<string, unknown>;
const PORTFOLIO_EVENTS = new Set(["PositionOpened", "PositionClosed", "PositionLiquidated", "PositionSettled", "ClaimQueued", "ClaimPaid"]);

export default function PortfolioPage() {
  const connected = useWallet();
  const demo = useDemoWallet();
  const owner = demo.publicKey ?? connected.publicKey?.toBase58();
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [claims, setClaims] = useState<ClaimView[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [signature, setSignature] = useState<string>();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [livePnls, setLivePnls] = useState<Record<string, string>>({});
  const actions = useWickActions();
  const feed = useFeed();
  const marketState = useMarkets();
  const backendReady = backendConfigured();
  const refreshKey = latestIndexerEventKey(feed.events, PORTFOLIO_EVENTS);
  useEffect(() => {
    const controller = new AbortController();
    if (!owner || !backendReady) return () => controller.abort();
    void Promise.all([getPositions(owner, controller.signal), getClaims(owner, controller.signal)])
      .then(([nextPositions, nextClaims]) => { setPositions(nextPositions); setClaims(nextClaims); setError(undefined); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => controller.abort();
  }, [owner, backendReady, refreshKey, refreshNonce]);
  useEffect(() => {
    let cancelled = false;
    const programId = process.env.NEXT_PUBLIC_PROGRAM_ID;
    if (!programId || positions.length === 0 || marketState.markets.length === 0) {
      setLivePnls({});
      return () => { cancelled = true; };
    }
    void calculateLivePositionPnls(positions, marketState.markets, programId)
      .then((values) => {
        if (!cancelled) setLivePnls(Object.fromEntries([...values].map(([address, value]) => [address, value.toString()])));
      })
      .catch(() => { if (!cancelled) setLivePnls({}); });
    return () => { cancelled = true; };
  }, [positions, marketState.markets]);
  const run = async (key: string, operation: () => Promise<string>) => {
    if (!actions.client) { setError(actions.error ?? "Trading is not configured."); return; }
    setBusy(key); setError(undefined); setSignature(undefined);
    try { setSignature(await operation()); setRefreshNonce((value) => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(undefined); }
  };

  return <div className="page-stack">
    <div className="page-header"><p className="eyebrow">DEVNET ACCOUNT</p><h1>Portfolio</h1><p>Positions and payouts indexed directly from Wick program events.</p></div>
    {!owner && <div className="notice">Create the demo wallet or connect Phantom / Solflare to load a portfolio.</div>}
    {owner && !backendReady && <div className="notice">Backend is not configured. No position data can be verified.</div>}
    {backendReady && !actions.client && <div className="notice">{actions.error ?? "Trading is not configured."}</div>}
    {error && <div className="notice" role="alert">{error}</div>}
    {signature && <div className="notice" role="status">Confirmed on devnet · {compactAddress(signature)}</div>}
    <section className="panel">
      <div className="section-heading"><div>Positions</div>{owner && <span className="muted">{compactAddress(owner)}</span>}</div>
      {positions.length === 0 ? <div className="empty">No indexed positions for this wallet.</div> : <div className="portfolio-list">
        {positions.map((position) => <article className="position-card" key={position.address}>
          <div><span className={`side-pill ${position.side}`}>{position.side.toUpperCase()}</span><strong>{compactAddress(position.market)}</strong><small>{position.status}</small></div>
          <dl><div><dt>Margin</dt><dd>{dollars(e6(position.marginE6), 2)}</dd></div><div><dt>Leverage</dt><dd>{position.leverage}×</dd></div><div><dt>Entry</dt><dd>{cents(position.entryE6 / 1_000_000)}</dd></div><div><dt>Contracts</dt><dd>{e6(position.contractsE6).toFixed(2)}</dd></div><div><dt>{position.status === "open" ? "Live PnL" : "Realized PnL"}</dt><dd>{position.status === "open" ? livePnls[position.address] === undefined ? "—" : dollars(e6(livePnls[position.address]), 2) : position.realizedPnlE6 === undefined ? "—" : dollars(e6(String(position.realizedPnlE6)), 2)}</dd></div></dl>
          {position.status === "open" && <div><button className="secondary-button" type="button" disabled={busy === position.address || !backendReady || !actions.client} onClick={() => void run(position.address, () => actions.client!.closePosition(position, 10_000))}>Close position</button><button className="text-button" type="button" disabled={busy === position.address || !backendReady || !actions.client} onClick={() => void run(position.address, () => actions.client!.settlePosition(position))}>Settle if resolved</button></div>}
        </article>)}
      </div>}
    </section>
    <section className="panel">
      <div className="section-heading"><div>Queued claims</div><span className="muted">FIFO pool payouts</span></div>
      {claims.length === 0 ? <div className="empty">No queued claims.</div> : claims.map((claim) => <div className="claim-row" key={claim.address}><span>Claim #{claim.claimIndex}</span><strong>{dollars(e6(claim.amountE6) - e6(claim.paidE6), 2)} owed</strong><span>{claim.status}</span><button className="secondary-button" disabled={busy === claim.address || claim.status === "paid" || !backendReady || !actions.client} onClick={() => void run(claim.address, () => actions.client!.claimQueue(claim))} type="button">Claim</button></div>)}
    </section>
  </div>;
}
