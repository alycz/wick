"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "skullet/react";
import type { MarketHistoryPoint, PositionSide, PricerMarket } from "@wick/shared";
import { WickChart, type ChartPoint, type ChartWindow } from "@/components/wick-chart";
import { useHealth, useMarketHistory, useMarkets } from "@/hooks/use-markets";
import { liveBackend, type HealthView } from "@/lib/api";
import { cents } from "@/lib/format";
import { dateLabel, defaultStrike, expiryGroups, impliedVol, shortLeft, signed, timeLabel, usd, type ExpiryGroup } from "@/lib/markets";
import { ChainGraph } from "./chain-graph";
import { Clock, ModeSwitch, Seg } from "./controls";
import { PricePicker } from "./price-picker";
import { EasyTicket, ProTicket, type TicketState } from "./tickets";

type Mode = "easy" | "pro";
const MODE_KEY = "wick:markets-mode";
const LIVE_MARK_MAX_AGE_MS = 10_000;
const LIVE_QUOTE_MAX_AGE_MS = 30_000;
const WINDOWS: ChartWindow[] = [{ label: "1m", secs: 60 }, { label: "5m", secs: 300 }, { label: "15m", secs: 900 }, { label: "30m", secs: 1800 }];

/* Keeps a growing series: the fetched history, plus a point each time a live value arrives. Resets when `key` changes. */
function useTrail(key: string, seed: ChartPoint[], live: ChartPoint | undefined): ChartPoint[] {
  const store = useRef<{ key: string; points: ChartPoint[] }>({ key, points: [] });
  if (store.current.key !== key) store.current = { key, points: [] };
  const extra = store.current.points;
  if (live && Number.isFinite(live.value) && (!extra.length || live.time > extra[extra.length - 1]!.time)) extra.push(live);
  if (extra.length > 3600) extra.splice(0, extra.length - 3600);
  return useMemo(() => {
    const merged = new Map<number, number>();
    for (const point of seed) merged.set(point.time, point.value);
    for (const point of extra) merged.set(point.time, point.value);
    return [...merged].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
    // extra is mutated in place; its length marks a change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, extra.length, key]);
}

const seconds = (ms: number) => Math.floor(ms / 1000);

function isLive(market: PricerMarket | undefined, health: HealthView | undefined, now: number, error?: string) {
  const age = market ? now - market.gemini.ts : undefined;
  return Boolean(market && !error && health?.ok && health.chainConfigured && health.volHealthy
    && health.markAgeMs !== undefined && health.markAgeMs <= LIVE_MARK_MAX_AGE_MS
    && age !== undefined && age >= -5_000 && age <= LIVE_QUOTE_MAX_AGE_MS);
}

function marketName(group: ExpiryGroup, market: PricerMarket) {
  return group.upDown ? "Up/Down 15m" : `> ${usd(market.strike, 0)} · ${group.label}`;
}

/* skeleton stand-in: the shape of a ladder, never shown as data */
const SAMPLE: PricerMarket[] = Array.from({ length: 9 }, (_, i) => ({
  symbol: `sample-${i}`, eventTicker: "sample", kind: "ladder" as const, duration: "1d", title: "", strike: 88_000 + i * 1_000,
  openTs: 0, expiryTs: 4_000_000_000_000, spot: 92_000, theo: Math.max(.02, Math.min(.98, 1 - i / 8)),
  gemini: { bid: .5, ask: .52, mid: .51, ts: 0 }, edge: .01, maxLeverage: 20, status: "open" as const, volSource: "deribit" as const,
}));

export function MarketsPage({ symbol }: { symbol?: string }) {
  const { markets, loading, error } = useMarkets();
  const { health } = useHealth();
  const ready = markets.length > 0;
  if (!ready && !loading) {
    return <div className="mk-page pro">
      <div className="p mk-empty" role="status">{error ?? "No live BTC markets are open right now."}</div>
    </div>;
  }
  return <Skeleton data={ready ? markets : null} sample={SAMPLE} id="markets" label="Loading markets">
    {(list) => <Markets markets={list} health={health} symbol={symbol} sample={!ready} {...(error ? { error } : {})} />}
  </Skeleton>;
}

function Markets({ markets, health, symbol, error, sample }: { markets: PricerMarket[]; health?: HealthView | undefined; symbol?: string | undefined; error?: string | undefined; sample: boolean }) {
  const [mode, setModeState] = useState<Mode>("pro");
  const [groupId, setGroupId] = useState<string>();
  const [selectedSymbol, setSelected] = useState<string | undefined>(symbol);
  const [side, setSide] = useState<PositionSide>("yes");
  const [amount, setAmount] = useState(25);
  const [leverage, setLeverage] = useState(5);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try { const saved = window.localStorage.getItem(MODE_KEY); if (saved === "easy" || saved === "pro") setModeState(saved); } catch { /* storage blocked */ }
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const setMode = (next: Mode) => {
    setModeState(next);
    try { window.localStorage.setItem(MODE_KEY, next); } catch { /* storage blocked */ }
  };

  const groups = useMemo(() => expiryGroups(markets), [markets]);
  const linked = symbol ? groups.find((item) => item.markets.some((market) => market.symbol === symbol)) : undefined;
  const group = groups.find((item) => item.id === groupId) ?? linked ?? groups.find((item) => item.id === "1d") ?? groups[0];
  const rows = group?.markets ?? [];
  const selected = rows.find((market) => market.symbol === selectedSymbol) ?? defaultStrike(rows);
  const { history } = useMarketHistory(sample ? "" : selected?.symbol ?? "");
  const allLadder = useMemo(() => markets.filter((market) => market.kind === "ladder"), [markets]);
  const sigma = (group && impliedVol(group.markets, now)) ?? impliedVol(allLadder, now) ?? .5;
  const spot = selected?.spot ?? markets[0]?.spot ?? 0;

  const spotSeed = useMemo(() => history.map((point: MarketHistoryPoint) => ({ time: seconds(point.ts), value: point.spot })), [history]);
  const spotTrail = useTrail("spot", spotSeed, spot ? { time: seconds(now), value: spot } : undefined);
  const theoSeed = useMemo(() => history.map((point) => ({ time: seconds(point.ts), value: point.theo })), [history]);
  const gemSeed = useMemo(() => history.filter((point) => point.geminiMid !== undefined).map((point) => ({ time: seconds(point.ts), value: point.geminiMid! })), [history]);
  const theoTrail = useTrail(`theo:${selected?.symbol}`, theoSeed, selected ? { time: seconds(now), value: selected.theo } : undefined);
  const gemTrail = useTrail(`gem:${selected?.symbol}`, gemSeed, selected?.gemini.mid !== undefined ? { time: seconds(now), value: selected.gemini.mid } : undefined);

  if (!group || !selected) {
    return <div className="mk-page pro"><div className="p mk-empty" role="status">No live BTC markets are open right now.</div></div>;
  }

  const ticket: TicketState = {
    side, setSide, amount, setAmount,
    leverage: Math.min(leverage, selected.maxLeverage), setLeverage,
  };
  const choose = (next: string) => {
    setSelected(next);
    const market = rows.find((item) => item.symbol === next);
    if (market) setLeverage((value) => Math.min(value, market.maxLeverage));
  };
  const chooseGroup = (id: string) => { setGroupId(id); setSelected(undefined); };
  const live = isLive(selected, health, now, error);
  const shared = { markets, groups, group, rows, selected, spot, sigma, now, health, live, error, history, ticket, choose, chooseGroup, mode, setMode, spotTrail, theoTrail, gemTrail };
  return mode === "pro" ? <Pro {...shared} /> : <Easy {...shared} />;
}

interface ViewProps {
  markets: PricerMarket[];
  groups: ExpiryGroup[];
  group: ExpiryGroup;
  rows: PricerMarket[];
  selected: PricerMarket;
  spot: number;
  sigma: number;
  now: number;
  health?: HealthView | undefined;
  live: boolean;
  error?: string | undefined;
  history: MarketHistoryPoint[];
  ticket: TicketState;
  choose: (symbol: string) => void;
  chooseGroup: (id: string) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  spotTrail: ChartPoint[];
  theoTrail: ChartPoint[];
  gemTrail: ChartPoint[];
}

const refFor = (group: ExpiryGroup, market: PricerMarket) => group.upDown ? { value: market.strike, label: "Target" } : { value: market.strike, label: `${(market.strike / 1000).toFixed(market.strike % 1000 ? 1 : 0)}k` };
const edgeClass = (edge: number | undefined) => edge === undefined || Math.abs(edge * 100) < .5 ? "gm" : edge > 0 ? "up" : "down";
const edgeText = (edge: number | undefined) => edge === undefined ? "–" : signed(edge * 100, (v) => v.toFixed(1));

/* ================= PRO ================= */
function Pro(props: ViewProps) {
  const { group, groups, rows, selected, spot, sigma, now, health, live, error, ticket, choose, chooseGroup, mode, setMode, spotTrail, theoTrail, gemTrail, history } = props;
  const [view, setView] = useState<"graph" | "table">("table");
  let spotRowDone = false;
  return <div className="mk-page pro">
    <div className="p stats">
      <div className="mk"><div className="coin sm" aria-hidden="true">₿</div><b>BTC</b></div>
      <div className="st"><span>Spot</span><b>{usd(spot)}</b></div>
      <div className="st"><span>Implied vol</span><b>{(sigma * 100).toFixed(1)}% · {cap(selected.volSource)}</b></div>
      <div className="st"><span>Mark age</span><b>{health?.markAgeMs === undefined ? "—" : `${(health.markAgeMs / 1000).toFixed(1)}s`}</b></div>
      <div className="st"><span>Prices</span>{liveBackend() ? <b className={live ? "live" : "stale"}>{live ? "Live" : "Stale"}</b> : <b>Demo</b>}</div>
      <div className="st"><span>Strikes</span><b>{rows.length}</b></div>
      <ModeSwitch mode={mode} onChange={setMode} />
    </div>
    {error && <p className="mk-notice" role="status">{error}</p>}
    <div className="p-grid">
      <div className="p-left">
        <section className="p p-chart" aria-label="BTC chart">
          <WickChart series={[{ id: "btc", label: "BTC", color: "#f7931a", data: spotTrail }]} format="usd" windows={WINDOWS} height={220} refLine={refFor(group, selected)} />
        </section>
        <section className="p chain" aria-label="Strike chain">
          <div className="chain-top">
            <Seg className="chain-exp" label="Expiry" value={group.id} onChange={chooseGroup}
              options={groups.map((item) => ({ value: item.id, label: item.upDown ? "15m up/down" : item.id === "1h" ? `Hourly ${item.label}` : item.label }))} />
            <span className="left">Expires in {shortLeft(group.expiryTs - now)}</span>
            <Seg className="vt" label="Chain view" value={view} onChange={setView} options={[{ value: "graph", label: "Graph" }, { value: "table", label: "Table" }]} />
          </div>
          {view === "graph" ? <>
            <ChainGraph rows={rows} selected={selected} onSelect={choose} spot={spot} upDown={group.upDown} />
            <div className="g-legend">
              <span><i style={{ background: "var(--wick)" }} />Wick fair price</span>
              <span><i style={{ background: "rgba(154,168,255,.35)", border: "1px solid rgba(154,168,255,.7)" }} />Gemini bid to ask</span>
              <span><i style={{ background: "var(--btc)", height: 2 }} />BTC spot</span>
              <span><i style={{ background: "var(--yes-hi)" }} /><i style={{ background: "var(--no-hi)" }} />Edge, Wick minus Gemini mid</span>
            </div>
          </> : <div className="tbl-wrap">
            <table>
              <thead><tr><th>Strike</th><th>Bid</th><th>Wick theo</th><th>Ask</th><th>Edge</th><th>Leverage</th><th>Distance</th></tr></thead>
              <tbody>
                {rows.map((row) => {
                  const dist = (row.strike / spot - 1) * 100;
                  const spotRow = !spotRowDone && !group.upDown && row.strike > spot;
                  if (spotRow) spotRowDone = true;
                  return [
                    spotRow ? <tr className="spot" key="spot"><td colSpan={7}>Current BTC spot <b>{usd(spot)}</b></td></tr> : null,
                    <tr key={row.symbol} className={`r${row.symbol === selected.symbol ? " sel" : ""}`} onClick={() => choose(row.symbol)}>
                      <td className="strike">{usd(row.strike, group.upDown ? 2 : 0)}</td>
                      <td className="bidc">{row.gemini.bid === undefined ? "–" : (row.gemini.bid * 100).toFixed(1)}</td>
                      <td className="theo">{(row.theo * 100).toFixed(1)}</td>
                      <td className="askc">{row.gemini.ask === undefined ? "–" : (row.gemini.ask * 100).toFixed(1)}</td>
                      <td className={edgeClass(row.edge)}>{edgeText(row.edge)}</td>
                      <td>{row.maxLeverage}x</td>
                      <td className="gm">{dist > 0 ? "+" : ""}{dist.toFixed(1)}%</td>
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>}
        </section>
      </div>
      <section className="p side-col bookp" aria-label="Gemini quote">
        <div className="book-h"><b>{group.upDown ? "Up/Down 15m" : `${usd(selected.strike, 0)} · ${group.label}`}</b><span>Gemini · YES · ¢</span></div>
        <Quote market={selected} now={now} theoTrail={theoTrail} gemTrail={gemTrail} />
      </section>
      <section className="p side-col" aria-label="Trade">
        <ProTicket market={selected} upDown={group.upDown} label={marketName(group, selected)} history={history} state={ticket} />
      </section>
    </div>
  </div>;
}

const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/* Gemini's top of book for the selected strike, drawn against Wick's fair price, with how the two have moved. */
function Quote({ market, now, theoTrail, gemTrail }: { market: PricerMarket; now: number; theoTrail: ChartPoint[]; gemTrail: ChartPoint[] }) {
  const { bid, ask, mid, last } = market.gemini;
  const fair = market.theo;
  const c = (value: number | undefined, digits = 1) => value === undefined ? "–" : `${(value * 100).toFixed(digits)}¢`;
  const ageSecs = Math.max(0, (now - market.gemini.ts) / 1000);
  /* zoom the scale around the quote and the fair price so the markers spread out */
  const points = [bid, ask, fair, mid].filter((value): value is number => value !== undefined);
  const lo = Math.max(0, Math.min(...points) - .04), hi = Math.min(1, Math.max(...points) + .04);
  const pos = (value: number) => `${((value - lo) / Math.max(hi - lo, .01)) * 100}%`;
  return <div className="qt">
    <div className="qt-ba">
      <div className="qt-cell b"><span>Bid</span><b>{c(bid)}</b></div>
      <div className="qt-cell a"><span>Ask</span><b>{c(ask)}</b></div>
    </div>
    <div className="qt-scale" aria-label={`Gemini ${c(bid)} to ${c(ask)}, Wick fair ${c(fair)}`}>
      <div className="qt-track">
        {bid !== undefined && ask !== undefined ? <i className="qt-band" style={{ left: pos(bid), width: `calc(${pos(ask)} - ${pos(bid)})` }} /> : null}
        {mid !== undefined ? <i className="qt-mid" style={{ left: pos(mid) }} /> : null}
        <i className="qt-fair" style={{ left: pos(fair) }}><em>Wick {c(fair)}</em></i>
      </div>
      <div className="qt-ends"><span>{c(lo, 0)}</span><span>{c(hi, 0)}</span></div>
    </div>
    <div className="qt-stats">
      <div><span>Spread</span><b>{bid !== undefined && ask !== undefined ? c(ask - bid) : "–"}</b></div>
      <div><span>Mid</span><b>{c(mid)}</b></div>
      <div><span>Edge vs mid</span><b className={edgeClass(market.edge)}>{market.edge === undefined ? "–" : `${edgeText(market.edge)}¢`}</b></div>
      <div><span>Last</span><b>{c(last)}</b></div>
      <div><span>Quote age</span><b>{ageSecs < 60 ? `${ageSecs.toFixed(0)}s` : `${Math.floor(ageSecs / 60)}m`}</b></div>
      <div><span>Leverage cap</span><b>{market.maxLeverage}x</b></div>
    </div>
    <FairVsMid theo={theoTrail} gem={gemTrail} />
  </div>;
}

/* small two-line chart: Wick fair against Gemini mid over the recent trail */
function FairVsMid({ theo, gem }: { theo: ChartPoint[]; gem: ChartPoint[] }) {
  const all = [...theo, ...gem];
  if (theo.length < 2) return <div className="qt-spark qt-spark-empty">The fair price trail appears as prices update.</div>;
  const t0 = Math.min(...all.map((p) => p.time)), t1 = Math.max(...all.map((p) => p.time));
  /* at least a 6¢ range, so a quote that ticks by a cent stays a calm line instead of filling the box */
  const lo = Math.min(...all.map((p) => p.value)), hi = Math.max(...all.map((p) => p.value));
  const span = Math.max(hi - lo, .06), v0 = (lo + hi) / 2 - span / 2;
  /* light smoothing: a 5-point moving average */
  const smooth = (data: ChartPoint[]) => data.map((p, i) => { const part = data.slice(Math.max(0, i - 2), i + 3); return { time: p.time, value: part.reduce((sum, q) => sum + q.value, 0) / part.length }; });
  const path = (data: ChartPoint[]) => smooth(data).map((p, i) => `${i ? "L" : "M"}${(((p.time - t0) / Math.max(t1 - t0, 1)) * 100).toFixed(2)},${(100 - ((p.value - v0) / span) * 80 - 10).toFixed(2)}`).join("");
  const mins = Math.max(1, Math.round((t1 - t0) / 60));
  return <div className="qt-spark">
    <div className="qt-spark-h"><span><i style={{ background: "var(--wick)" }} />Wick fair</span><span><i style={{ background: "#9aa8ff" }} />Gemini mid</span><span className="mu">{mins}m</span></div>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {gem.length > 1 ? <path d={path(gem)} stroke="#9aa8ff" /> : null}
      <path d={path(theo)} stroke="var(--wick)" />
    </svg>
  </div>;
}

/* ================= EASY ================= */
function ExpiryDropdown({ groups, group, onChange }: { groups: ExpiryGroup[]; group: ExpiryGroup; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);
  const dot = (item: ExpiryGroup) => item.upDown ? <i className="lv-dot" aria-hidden="true" /> : null;
  return <div className="xdd" ref={box} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
    <button type="button" className="xdd-b" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{dot(group)}{group.label}</span>
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && <div className="xdd-m" role="listbox" aria-label="Expiry">
      {groups.map((item) => <button type="button" role="option" key={item.id} aria-selected={item.id === group.id} onClick={() => { setOpen(false); onChange(item.id); }}>
        {dot(item)}{item.label}<small>{item.upDown ? "Up or down" : `${item.name} · ${timeLabel(item.expiryTs)}`}</small>
      </button>)}
    </div>}
  </div>;
}

function Easy(props: ViewProps) {
  const { group, groups, rows, selected, spot, sigma, now, live, error, ticket, choose, chooseGroup, mode, setMode, spotTrail, theoTrail, gemTrail, history } = props;
  const [view, setView] = useState<"pick" | "list">("pick");
  const [showAll, setShowAll] = useState(false);
  const up = group.upDown;
  const when = group.id === "1h" ? `at ${group.label}` : `on ${group.label}`;
  const title = up ? "BTC Up or Down · 15 minutes" : `Bitcoin above ___ ${when}?`;
  const first = spotTrail[0]?.value;
  const change = first ? spot - first : undefined;
  const spanMins = spotTrail.length > 1 ? Math.round((spotTrail[spotTrail.length - 1]!.time - spotTrail[0]!.time) / 60) : 0;
  const pickMode = !up && view === "pick";
  const visible = showAll ? rows : rows.filter((row) => row.theo > .03 && row.theo < .97);
  const hidden = rows.length - visible.length;
  const edge = selected.edge;
  let divider = false;
  const setSideFor = (market: PricerMarket, next: PositionSide) => { choose(market.symbol); ticket.setSide(next); };

  return <div className="mk-page easy">
    <div className="pagebar">
      <div className="pb-e">
        <div className="pb-clock"><span>{up ? "Window ends in" : "Settles in"}</span><Clock msLeft={group.expiryTs - now} /></div>
        <i className="pb-div" aria-hidden="true" />
        <ExpiryDropdown groups={groups} group={group} onChange={chooseGroup} />
        <i className="pb-div" aria-hidden="true" />
        <div className="pb-stats">
          <div className="st"><span>Implied vol</span><b>{(sigma * 100).toFixed(1)}%</b></div>
          <div className="st"><span>Vol source</span><b>{cap(selected.volSource)}</b></div>
          <div className="st"><span>Strikes</span><b>{rows.length}</b></div>
          <div className="st"><span>Prices</span>{liveBackend() ? <b className={live ? "live" : "stale"}>{live ? "Live" : "Stale"}</b> : <b>Demo</b>}</div>
        </div>
      </div>
      <ModeSwitch mode={mode} onChange={setMode} />
    </div>
    {error && <p className="mk-notice" role="status">{error}</p>}
    <div style={{ minWidth: 0 }}>
      <div className="ev-head">
        <div className="ev-id"><div className="coin" aria-hidden="true">₿</div><div><small>Crypto · Bitcoin</small><h1>{title}</h1></div></div>
        <div className="ev-px">
          {change !== undefined && spanMins > 0 && <div className="k-chg"><span className={change >= 0 ? "up" : "down"}>{change >= 0 ? "▲" : "▼"} {usd(Math.abs(change))} ({Math.abs(change / first! * 100).toFixed(2)}%)</span><span className="mu">{spanMins}m</span></div>}
          <div className="k-px">{usd(spot)}</div>
        </div>
      </div>
      {up && <div className="ud">
        <div><span>Price to beat</span><b>{usd(selected.strike)}</b></div>
        <div className="sep" />
        <div className="cur"><span>Current price <span className={spot >= selected.strike ? "up" : "down"}>{spot >= selected.strike ? "▲" : "▼"} {usd(Math.abs(spot - selected.strike), 0)}</span></span><b>{usd(spot)}</b></div>
      </div>}
      <section className="p e-chartp" aria-label="BTC chart">
        <WickChart series={[{ id: "btc", label: "BTC", color: "#f7931a", data: spotTrail }]} format="usd" windows={WINDOWS} height={260} refLine={refFor(group, selected)} />
      </section>
      {!up && <div className="pk-bar">
        <h2>Where will BTC be at {timeLabel(group.expiryTs)}{group.id === "1h" ? "" : ` on ${dateLabel(group.expiryTs)}`}?</h2>
        <Seg className="wc-tabs" buttonClass="wc-tab" label="View" value={view} onChange={setView} options={[{ value: "pick", label: "Price picker" }, { value: "list", label: "All strikes" }]} />
      </div>}
      {pickMode && <PricePicker rows={rows} selected={selected} onSelect={choose} side={ticket.side} onSide={ticket.setSide} spot={spot} sigma={sigma} expiryTs={group.expiryTs} />}
      {!pickMode && <div>
        {up ? <div className="row sel">
          <div className="k"><b>Up or down from {usd(selected.strike)}</b><small>Gemini {cents(selected.gemini.bid)} / {cents(selected.gemini.ask)} · {selected.maxLeverage}x</small></div>
          <div className="pct">{Math.round(selected.theo * 100)}<sup>%</sup></div>
          <div className="yn">
            <button type="button" className={`by${ticket.side === "yes" ? " on" : ""}`} onClick={() => ticket.setSide("yes")}>Up {cents(selected.theo)}</button>
            <button type="button" className={`bn${ticket.side === "no" ? " on" : ""}`} onClick={() => ticket.setSide("no")}>Down {cents(1 - selected.theo)}</button>
          </div>
        </div> : <>
          {visible.map((row) => {
            const pct = Math.round(row.theo * 100);
            const quote = row.gemini.bid === undefined && row.gemini.ask === undefined ? "No Gemini quote"
              : `Gemini ${row.gemini.bid === undefined ? "–" : (row.gemini.bid * 100).toFixed(0)}–${row.gemini.ask === undefined ? "–" : (row.gemini.ask * 100).toFixed(0)}¢`;
            const showDivider = !divider && row.strike > spot;
            if (showDivider) divider = true;
            const on = row.symbol === selected.symbol;
            return <div key={row.symbol}>
              {showDivider && <div className="divider">BTC now <b>{usd(spot)}</b></div>}
              <div className={`row${on ? " sel" : ""}`} onClick={() => choose(row.symbol)}>
                <div className="k"><b>{row.strike.toLocaleString("en-US")}</b><small>{quote} · {row.maxLeverage}x</small></div>
                <div className={`pct${pct < 5 ? " lo" : ""}`}>{pct < 1 ? "<1" : pct}<sup>%</sup></div>
                <div className="yn">
                  <button type="button" className={`by${on && ticket.side === "yes" ? " on" : ""}`} onClick={(event) => { event.stopPropagation(); setSideFor(row, "yes"); }}>Buy Yes {cents(row.theo)}</button>
                  <button type="button" className={`bn${on && ticket.side === "no" ? " on" : ""}`} onClick={(event) => { event.stopPropagation(); setSideFor(row, "no"); }}>Buy No {cents(1 - row.theo)}</button>
                </div>
              </div>
            </div>;
          })}
          {!divider && <div className="divider">BTC now <b>{usd(spot)}</b></div>}
          {(hidden > 0 || showAll) && <button type="button" className="more" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer strikes" : `Show ${hidden} more strikes (under 3% or over 97%)`}</button>}
        </>}
      </div>}
      <section className="e-detail" aria-label="Selected market">
        <div className="pk-bar"><h2>Wick fair vs Gemini · {up ? "Up or Down · 15 minutes" : `Above ${usd(selected.strike, 0)}`}</h2>
          <span className="mu" style={{ fontSize: 13 }}>{up ? `Window ends ${timeLabel(group.expiryTs)}` : `Settles ${dateLabel(group.expiryTs)}, ${timeLabel(group.expiryTs)}`}</span></div>
        <div className="p stats ed-stats">
          <div className="st"><span>Chance</span><div className="big">{Math.round(selected.theo * 100)}%<small>{up ? "Up" : "Yes"}</small></div></div>
          <div className="st"><span>Wick fair price</span><b style={{ color: "var(--wick)" }}>{cents(selected.theo)}</b></div>
          <div className="st"><span>Gemini bid / ask</span><b>{selected.gemini.bid === undefined && selected.gemini.ask === undefined ? "No quote" : `${cents(selected.gemini.bid)} / ${cents(selected.gemini.ask)}`}</b></div>
          <div className="st"><span>Edge vs Gemini mid</span><b className={edgeClass(edge)}>{edge === undefined ? "–" : signed(edge * 100, (v) => `${v.toFixed(1)}¢`)}</b></div>
          <div className="st"><span>Leverage cap</span><b>{selected.maxLeverage}x</b></div>
        </div>
        <section className="p ed-chartp">
          <WickChart format="cents" windows={WINDOWS} height={220}
            series={[{ id: "wick", label: "Wick fair", color: "#5fd4cc", data: theoTrail }, { id: "gemini", label: "Gemini mid", color: "#9aa8ff", data: gemTrail }]} />
        </section>
        <div className="rules">
          <p>{up
            ? `Resolves Up if Gemini's official BTC price at ${timeLabel(group.expiryTs)} is at or above ${usd(selected.strike)}, the price at the start of the window. Otherwise it resolves Down.`
            : `Resolves Yes if Gemini's official BTC settlement price at ${timeLabel(group.expiryTs)} on ${dateLabel(group.expiryTs)} is above ${usd(selected.strike, 0)}. Otherwise it resolves No.`}</p>
          <p>Wick does not decide outcomes. It uses Gemini&apos;s published result for the matching contract. Leverage is capped at {selected.maxLeverage}x for this market.</p>
        </div>
      </section>
      <div className="about"><h2>How Wick prices this</h2><p>{up
        ? "Wick's Up price is its fair chance that BTC finishes the window above the price to beat, from options volatility. Leverage is capped per market and falls as the window gets close."
        : "Each percentage is Wick's fair chance that BTC finishes above the strike, from options volatility. Gemini's own bid and ask show under each strike, and markets settle on Gemini's official result."}</p></div>
    </div>
    <aside className="ticket"><EasyTicket market={selected} upDown={up} expiryLabel={group.label} history={history} state={ticket} /></aside>
  </div>;
}
