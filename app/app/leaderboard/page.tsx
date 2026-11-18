"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useMemo, useState } from "react";
import { useShowSimulated } from "@/components/demo-account";
import { Seg } from "@/components/markets/controls";
import { useDemoWallet } from "@/components/wallet-panel";
import { leaderboard, myRank, type LeaderRow, type Period, type RankBy } from "@/lib/demo/stats-sim";
import { compactAddress } from "@/lib/format";
import { signed, usd } from "@/lib/markets";
import "@/styles/stats.css";

/* The backend doesn't rank traders yet. On the demo account (or demo market data) the page shows simulated rankings;
   with a connected wallet on a live backend it shows its frame with placeholders. */

const avatar = (hue: number) => ({ background: `conic-gradient(from ${hue}deg, hsl(${hue} 70% 60%), hsl(${(hue + 120) % 360} 70% 55%), hsl(${hue} 70% 60%))` });
const money = (value: number) => <span className={value >= 0 ? "up" : "down"}>{signed(value, (v) => usd(v, 0))}</span>;

export default function LeaderboardPage() {
  const connected = useWallet();
  const demo = useDemoWallet();
  const owner = demo.publicKey ?? connected.publicKey?.toBase58();
  const simulated = useShowSimulated();
  const [period, setPeriod] = useState<Period>("7d");
  const [by, setBy] = useState<RankBy>("pnl");
  const rows = useMemo(() => simulated ? leaderboard(period, by) : [], [simulated, period, by]);
  const me = simulated ? myRank(period) : undefined;
  const lead = (row: LeaderRow) => by === "pnl" ? money(row.pnl) : usd(row.volume, 0);
  const other = (row: LeaderRow) => by === "pnl" ? usd(row.volume, 0) : money(row.pnl);

  return <div className="lb-page">
    <div className="pg-hd">
      <div><h1>Leaderboard</h1><p>Top Wick traders, ranked on settled and closed trades.</p></div>
      <div className="ctl">
        <Seg className="wc-tabs" buttonClass="wc-tab" label="Period" value={period} onChange={setPeriod}
          options={[{ value: "24h", label: "24h" }, { value: "7d", label: "7d" }, { value: "30d", label: "30d" }, { value: "all", label: "All time" }]} />
        <Seg className="wc-tabs" buttonClass="wc-tab" label="Rank by" value={by} onChange={setBy}
          options={[{ value: "pnl", label: "PnL" }, { value: "volume", label: "Volume" }]} />
      </div>
    </div>
    <section className="p me" aria-label="Your rank">
      <div><span>Your rank</span><b className="rk">{me ? `#${me.rank}` : "—"}</b></div>
      <div><span>PnL</span><b className={me ? me.pnl >= 0 ? "up" : "down" : undefined}>{me ? signed(me.pnl, (v) => usd(v)) : "—"}</b></div>
      <div><span>Volume</span><b>{me ? usd(me.volume, 0) : "—"}</b></div>
      <div><span>Win rate</span><b>{me ? `${me.winRate}%` : "—"}</b></div>
      <div><span>Wallet</span><b>{owner ? compactAddress(owner) : "Not connected"}</b></div>
    </section>
    {rows.length >= 3 ? <div className="podium" key={`${period}-${by}`}>
      {rows.slice(0, 3).map((row, index) => <div className="p pod" key={row.id}>
        <div className="pt"><span className="n">{index + 1}</span><span className="av" style={avatar(row.hue)} /><b>{row.trader}</b></div>
        <div className="v">{lead(row)}</div>
        <div className="meta2"><span>{by === "pnl" ? "Volume" : "PnL"} <b>{other(row)}</b></span><span>Win rate <b>{row.winRate.toFixed(0)}%</b></span></div>
      </div>)}
    </div> : null}
    <section className="p" style={{ overflowX: "auto" }}>
      <table className="lbt">
        <thead><tr><th>Rank</th><th>Trader</th><th>{by === "pnl" ? "PnL" : "Volume"}</th><th>ROI</th><th>{by === "pnl" ? "Volume" : "PnL"}</th><th>Win rate</th><th>Trades</th><th>Favourite market</th></tr></thead>
        <tbody key={`${period}-${by}`}>
          {rows.length === 0 ? <tr><td colSpan={8} className="nodata">No data yet. Rankings appear here once trader results are indexed.</td></tr>
            : rows.map((row, index) => <tr key={row.id}>
              <td className="mu">{index + 1}</td>
              <td><div className="who"><span className="av" style={avatar(row.hue)} />{row.trader}</div></td>
              <td>{lead(row)}</td>
              <td className={row.roi >= 0 ? "up" : "down"}>{signed(row.roi, (v) => `${v.toFixed(1)}%`)}</td>
              <td>{other(row)}</td>
              <td><div className="wr"><i><b style={{ width: `${row.winRate.toFixed(0)}%` }} /></i>{row.winRate.toFixed(0)}%</div></td>
              <td>{row.trades.toLocaleString("en-US")}</td>
              <td className="mu">{row.market}</td>
            </tr>)}
        </tbody>
      </table>
    </section>
  </div>;
}
