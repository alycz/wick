"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { useDemoAccount } from "@/components/demo-account";
import { Seg } from "@/components/markets/controls";
import { useDemoWallet } from "@/components/wallet-panel";
import { compactAddress } from "@/lib/format";
import { GUEST_LEADERBOARD } from "@/lib/demo/preview";
import { usd } from "@/lib/markets";
import "@/styles/stats.css";

/* Ranks need per-trader results from the backend, which it doesn't serve yet, so the page shows its frame with placeholders. */
type Period = "24h" | "7d" | "30d" | "all";
type By = "pnl" | "volume";

/* a stable two-tone gradient per trader, so avatars read as identities without fetching anything */
function avatar(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return `linear-gradient(135deg, hsl(${hue} 70% 62%), hsl(${(hue + 60) % 360} 70% 48%))`;
}

export default function LeaderboardPage() {
  const connected = useWallet();
  const demo = useDemoWallet();
  const account = useDemoAccount();
  const guestPreview = account?.active === true;
  const owner = demo.publicKey ?? connected.publicKey?.toBase58();
  const [period, setPeriod] = useState<Period>("7d");
  const [by, setBy] = useState<By>("pnl");
  const mine = GUEST_LEADERBOARD.find((row) => "mine" in row)!;
  const rows = [...GUEST_LEADERBOARD].sort((a, b) => by === "pnl" ? b.pnl - a.pnl : b.volume - a.volume);
  return <div className="lb-page">
    <div className="pg-hd rise">
      <div className="ctl">
        <Seg className="wc-tabs" buttonClass="wc-tab" label="Period" value={period} onChange={setPeriod}
          options={[{ value: "24h", label: "24h" }, { value: "7d", label: "7d" }, { value: "30d", label: "30d" }, { value: "all", label: "All time" }]} />
        <Seg className="wc-tabs" buttonClass="wc-tab" label="Rank by" value={by} onChange={setBy}
          options={[{ value: "pnl", label: "PnL" }, { value: "volume", label: "Volume" }]} />
      </div>
    </div>
    <section className="p me rise rise-1" aria-label="Your rank">
      <div><span>Your rank</span><b className="rk">{guestPreview ? `#${rows.findIndex((row) => "mine" in row) + 1}` : "—"}</b></div>
      <div><span>PnL</span><b className={guestPreview ? "up" : ""}>{guestPreview ? `+${usd(mine.pnl)}` : "—"}</b></div>
      <div><span>Volume</span><b>{guestPreview ? usd(mine.volume) : "—"}</b></div>
      <div><span>Win rate</span><b>{guestPreview ? `${mine.winRate}%` : "—"}</b></div>
      <div><span>{guestPreview ? "Trades" : "Wallet"}</span><b>{guestPreview ? mine.trades : owner ? compactAddress(owner) : "Not connected"}</b></div>
    </section>
    <section className="p rise rise-2" style={{ overflowX: "auto" }}>
      <table className="lbt">
        <thead><tr><th>Rank</th><th>Trader</th><th>{by === "pnl" ? "PnL" : "Volume"}</th><th>ROI</th><th>{by === "pnl" ? "Volume" : "PnL"}</th><th>Win rate</th><th>Trades</th><th>Favourite market</th></tr></thead>
        <tbody>{guestPreview ? rows.map((row, index) => <tr key={row.trader} className={"mine" in row ? "mine" : undefined} style={{ animationDelay: `${120 + index * 35}ms` }}>
          <td><span className={`rank r${index + 1}`}>{index + 1}</span></td><td><span className="who"><i className="av" style={{ background: avatar(row.trader) }} /><b>{row.trader}</b></span></td>
          <td className={by === "pnl" ? "up" : ""}>{by === "pnl" ? `+${usd(row.pnl)}` : usd(row.volume)}</td>
          <td>{row.roi.toFixed(1)}%</td><td>{by === "pnl" ? usd(row.volume) : `+${usd(row.pnl)}`}</td>
          <td><span className="wr"><span>{row.winRate}%</span><i><b style={{ width: `${row.winRate}%` }} /></i></span></td>
          <td>{row.trades}</td><td>{row.market}</td>
        </tr>) : <tr><td colSpan={8} className="nodata">No data yet. Rankings appear here once trader results are indexed.</td></tr>}</tbody>
      </table>
    </section>
  </div>;
}
