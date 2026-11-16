"use client";

import { useFeed } from "@/hooks/use-feed";
import { compactAddress } from "@/lib/format";

const names: Record<string, string> = {
  PositionOpened: "Position opened", PositionClosed: "Position closed", PositionLiquidated: "Liquidation",
  MarketSettled: "Market settled", ClaimQueued: "Payout queued", ClaimPaid: "Payout paid", LpUpdated: "Pool updated",
};

export function ActivityRail() {
  const { events, connected } = useFeed();
  return (
    <aside className="activity-rail" aria-label="Market activity">
      <div className="section-heading">
        <div><span className={`live-dot ${connected ? "connected" : ""}`} /> Live via QuickNode Streams</div>
      </div>
      <div className="activity-list">
        {events.length === 0 && <div className="empty compact">No indexed devnet events yet.</div>}
        {events.map((event) => (
          <a className="activity-item" key={`${event.signature}-${event.eventIndex}`}
            href={`https://explorer.solana.com/tx/${event.signature}?cluster=devnet`} target="_blank" rel="noreferrer">
            <span>{names[event.name] ?? event.name}</span>
            <small>{new Date(event.blockTime * 1_000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {compactAddress(event.signature)}</small>
          </a>
        ))}
      </div>
    </aside>
  );
}
