"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PricerMarket } from "@wick/shared";
import { Sparkline } from "@/components/ui/sparkline";
import { useMarketHistory } from "@/hooks/use-markets";
import { cents } from "@/lib/format";
import { defaultStrike, settlementUtc, shortLeft, timeLabel, usd, type ExpiryGroup } from "@/lib/markets";

/* The BTC market switcher. The trigger is the coin and name at the start of the stats row; it opens a panel
   that lists every open BTC market with a live sparkline of its Wick fair price. */

export const groupTitle = (group: ExpiryGroup) => group.upDown ? `${group.label} Up/Down`
  : group.duration === "1h" ? `Hourly · ${group.label}` : `${group.label} · ${group.name}`;

function MarketRow({ group, index, current, now, onPick }: { group: ExpiryGroup; index: number; current: boolean; now: number; onPick: () => void }) {
  const market = defaultStrike(group.markets) as PricerMarket;
  const { history, loading } = useMarketHistory(market.symbol);
  const values = history.filter((point) => !group.upDown || point.ts >= market.openTs).map((point) => point.theo);
  const trail = values.length > 1 ? [...values.slice(-80), market.theo] : values;
  const change = trail.length > 1 ? market.theo - trail[0]! : 0;
  const lo = Math.min(...trail); const hi = Math.max(...trail); const mid = (lo + hi) / 2; const half = Math.max((hi - lo) / 2, .03);
  const color = !trail.length ? "#5fd4cc" : change >= 0 ? "#22c55e" : "#f0505d";
  return <button type="button" role="menuitemradio" aria-checked={current}
    aria-label={group.upDown ? `${group.duration} up/down` : `${groupTitle(group)} · ${group.markets.length} ${group.markets.length === 1 ? "strike" : "strikes"}`} className={`mm-row${current ? " on" : ""}`} onClick={onPick}
    style={{ animationDelay: `${40 + index * 32}ms` }}>
    <span className="mm-name">
      <b>{groupTitle(group)}</b>
      <small>{group.upDown ? `Price to beat ${usd(market.strike)}` : `${group.markets.length} strikes · ${settlementUtc(group.expiryTs)}`}</small>
    </span>
    <span className="mm-spark">{loading ? <i className="mm-skel" /> : <Sparkline values={trail} color={color} width={128} height={34} min={mid - half} max={mid + half} />}</span>
    <span className="mm-val">
      <b>{group.upDown ? `Up ${cents(market.theo)}` : `${Math.round(market.theo * 100)}%`}</b>
      <small>{group.upDown ? `Ends ${timeLabel(group.expiryTs)}` : `Above ${usd(market.strike, 0)}`}</small>
    </span>
    <span className="mm-left">{shortLeft(group.expiryTs - now)}</span>
  </button>;
}

export function MarketMenu({ groups, group, now, spot, onPick, compact = false }: {
  groups: ExpiryGroup[];
  group: ExpiryGroup;
  now: number;
  spot: number;
  onPick: (group: ExpiryGroup) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = (focus = true) => {
    setClosing(true);
    window.setTimeout(() => { setOpen(false); setClosing(false); }, 160);
    if (focus) trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node)) close(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  });
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) { event.preventDefault(); close(); return; }
    if (!open || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const rows = Array.from(host.current?.querySelectorAll<HTMLButtonElement>(".mm-row") ?? []);
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    rows[event.key === "ArrowDown" ? Math.min(rows.length - 1, at + 1) : Math.max(0, at - 1)]?.focus();
  };
  const upDown = groups.filter((item) => item.upDown);
  const dated = groups.filter((item) => !item.upDown);
  let index = 0;
  const section = (title: string, list: ExpiryGroup[]) => list.length > 0 && <div className="mm-sec">
    <span className="mm-sec-t">{title}</span>
    {list.map((item) => <MarketRow key={item.id} group={item} index={index++} current={item.id === group.id} now={now}
      onPick={() => { onPick(item); close(); }} />)}
  </div>;

  return <div ref={host} className={`mm${open ? " open" : ""}${compact ? " compact" : ""}`} onKeyDown={onKey}>
    <button ref={trigger} type="button" className="mm-trigger" aria-haspopup="menu" aria-expanded={open} aria-label={`BTC market: ${groupTitle(group)}. Change market`}
      onClick={() => (open ? close() : (setClosing(false), setOpen(true)))}>
      <span className="coin mm-coin" aria-hidden="true">₿</span>
      <span className="mm-id"><b>BTC</b><small>{groupTitle(group)}</small></span>
      <span className="mm-chev" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
    </button>
    {open && <div className={`mm-panel${closing ? " out" : ""}`} role="menu" aria-label="BTC markets">
      <div className="mm-head">
        <div><b>Bitcoin markets</b><small>{groups.length} open · BTC {usd(spot)}</small></div>
        <span className="mm-live"><i />Live</span>
      </div>
      {section("Up or Down", upDown)}
      {section("Price at expiry", dated)}
    </div>}
  </div>;
}
