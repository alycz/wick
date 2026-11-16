"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import type { PositionView } from "@wick/shared";
import { useDemoWallet } from "@/components/wallet-panel";
import { backendConfigured, getClaims, getPositions, type ClaimView } from "@/lib/api";
import { chainConfigurationError } from "@/lib/chain";
import { cents, compactAddress, dollars, e6 } from "@/lib/format";

type PositionRow = PositionView & Record<string, unknown>;

export default function PortfolioPage() {
  const connected = useWallet();
  const demo = useDemoWallet();
  const owner = demo.publicKey ?? connected.publicKey?.toBase58();
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [claims, setClaims] = useState<ClaimView[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    if (!owner || !backendConfigured()) return () => controller.abort();
    void Promise.all([getPositions(owner, controller.signal), getClaims(owner, controller.signal)])
      .then(([nextPositions, nextClaims]) => { setPositions(nextPositions); setClaims(nextClaims); setError(undefined); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => controller.abort();
  }, [owner]);
  const action = () => setError(chainConfigurationError());

  return <div className="page-stack">
    <div className="page-header"><p className="eyebrow">DEVNET ACCOUNT</p><h1>Portfolio</h1><p>Positions and payouts indexed directly from Wick program events.</p></div>
    {!owner && <div className="notice">Create the demo wallet or connect Phantom / Solflare to load a portfolio.</div>}
    {owner && !backendConfigured() && <div className="notice">Backend is not configured. No position data can be verified.</div>}
    {error && <div className="notice" role="alert">{error}</div>}
    <section className="panel">
      <div className="section-heading"><div>Positions</div>{owner && <span className="muted">{compactAddress(owner)}</span>}</div>
      {positions.length === 0 ? <div className="empty">No indexed positions for this wallet.</div> : <div className="portfolio-list">
        {positions.map((position) => <article className="position-card" key={position.address}>
          <div><span className={`side-pill ${position.side}`}>{position.side.toUpperCase()}</span><strong>{compactAddress(position.market)}</strong><small>{position.status}</small></div>
          <dl><div><dt>Margin</dt><dd>{dollars(e6(position.marginE6), 2)}</dd></div><div><dt>Leverage</dt><dd>{position.leverage}×</dd></div><div><dt>Entry</dt><dd>{cents(position.entryE6 / 1_000_000)}</dd></div><div><dt>Contracts</dt><dd>{e6(position.contractsE6).toFixed(2)}</dd></div><div><dt>Realized PnL</dt><dd>{position.realizedPnlE6 === undefined ? "Live" : dollars(e6(String(position.realizedPnlE6)), 2)}</dd></div></dl>
          {position.status === "open" && <button className="secondary-button" type="button" onClick={action}>Close position</button>}
        </article>)}
      </div>}
    </section>
    <section className="panel">
      <div className="section-heading"><div>Queued claims</div><span className="muted">FIFO pool payouts</span></div>
      {claims.length === 0 ? <div className="empty">No queued claims.</div> : claims.map((claim) => <div className="claim-row" key={claim.address}><span>Claim #{claim.claimIndex}</span><strong>{dollars(e6(claim.amountE6) - e6(claim.paidE6), 2)} owed</strong><span>{claim.status}</span><button className="secondary-button" onClick={action} type="button">Claim</button></div>)}
    </section>
  </div>;
}
