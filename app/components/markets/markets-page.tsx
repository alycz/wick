"use client";

import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "skullet/react";
import type { ArchivedLadderContract, ArchivedUpDownContract, MarketHistoryPoint, PositionSide, PricerMarket } from "@wick/shared";
import { WickChart, type ChartPoint } from "@/components/wick-chart";
import { useHealth, useMarketHistory, useMarkets } from "@/hooks/use-markets";
import { usePriceTrail as useTrail } from "@/hooks/use-price-trail";
import { getLadderContracts, getUpDownContracts, type HealthView } from "@/lib/api";
import { cents } from "@/lib/format";
import { dateLabel, defaultStrike, expiryGroups, impliedVol, shortLeft, signed, settlementUtc, timeLabel, usd, validQuote, type ExpiryGroup } from "@/lib/markets";
import { ChainGraph } from "./chain-graph";
import { Clock, ModeSwitch, Seg } from "./controls";
import { PricePicker } from "./price-picker";
import { EasyTicket, ProTicket, type TicketState } from "./tickets";
import { ContractPriceChart } from "./contract-price-chart";

type Mode = "easy" | "pro";
const MODE_KEY = "wick:markets-mode";
const LIVE_MARK_MAX_AGE_MS = 10_000;
const LIVE_QUOTE_MAX_AGE_MS = 30_000;

const seconds = (ms: number) => Math.floor(ms / 1000);

function isLive(market: PricerMarket | undefined, health: HealthView | undefined, now: number, error?: string) {
  const age = market ? now - market.gemini.ts : undefined;
  const pricingAge = health?.pricingAgeMs ?? health?.markAgeMs;
  return Boolean(market && !error && health?.ok && health.volHealthy
    && pricingAge !== undefined && pricingAge <= LIVE_MARK_MAX_AGE_MS
    && age !== undefined && age >= -5_000 && age <= LIVE_QUOTE_MAX_AGE_MS);
}

function marketName(group: ExpiryGroup, market: PricerMarket) {
  return group.upDown ? `Up/Down ${market.duration}` : `> ${usd(market.strike, 0)} · ${group.label}`;
}

/* skeleton stand-in: the shape of a ladder, never shown as data */
const SAMPLE: PricerMarket[] = Array.from({ length: 9 }, (_, i) => ({
  symbol: `sample-${i}`, eventTicker: "sample", kind: "ladder" as const, duration: "1d", title: "", strike: 88_000 + i * 1_000,
  openTs: 0, expiryTs: 4_000_000_000_000, spot: 92_000, theo: Math.max(.02, Math.min(.98, 1 - i / 8)),
  gemini: { bid: .5, ask: .52, mid: .51, ts: 0 }, edge: .01, maxLeverage: 20, status: "open" as const, volSource: "deribit" as const,
}));

export function MarketsPage({ symbol }: { symbol?: string }) {
  const { markets, loading, error, observedAt } = useMarkets();
  const { health } = useHealth();
  const ready = markets.length > 0;
  const unpriced = health?.unpricedMarkets ?? [];
  if (loading && !ready) return <Skeleton data={null as PricerMarket[] | null} sample={SAMPLE} id="markets" label="Loading markets">
    {(list) => <Markets markets={list} sample />}
  </Skeleton>;
  return <>
    <Markets key={symbol ?? "board"} markets={markets} health={health} symbol={symbol} sample={false} observedAt={observedAt} error={error} />
    {unpriced.length > 0 && <details className="p mk-page">
      <summary>Fair price unavailable · {unpriced.length} contracts</summary>
      <ul>{unpriced.map((market) => <li key={market.symbol}>
        <a href={`/m/${encodeURIComponent(market.symbol)}`}>{market.symbol}</a> · {settlementUtc(market.expiryTs)}
      </li>)}</ul>
    </details>}
    <div className="mk-page mk-history-wrap"><PastDatedPrices /><PastUpDownPrices /></div>
  </>;
}

function PastDatedPrices() {
  const [expanded, setExpanded] = useState(false);
  return <details className="p mk-history" onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary>Past dated BTC markets</summary>
    {expanded && <DatedMarketArchive />}
  </details>;
}

function DatedMarketArchive() {
  const [contracts, setContracts] = useState<ArchivedLadderContract[]>();
  const [error, setError] = useState<string>();
  const [selectedDate, setSelectedDate] = useState<number>();
  const [selected, setSelected] = useState<string>();
  const [side, setSide] = useState<PositionSide>("yes");

  useEffect(() => {
    const controller = new AbortController();
    void getLadderContracts(controller.signal)
      .then((value) => { if (!controller.signal.aborted) setContracts(value); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, []);

  if (error) return <p role="status">Couldn’t load past dated markets. {error}</p>;
  if (!contracts) return <p role="status">Loading past dated markets…</p>;
  if (!contracts.length) return <p role="status">No recorded dated markets have expired yet.</p>;
  const dates = [...new Set(contracts.map((item) => item.expiryTs))];
  const expiry = selectedDate ?? dates[0];
  const strikes = contracts.filter((item) => item.expiryTs === expiry);
  const contract = strikes.find((item) => item.symbol === selected) ?? strikes[Math.floor(strikes.length / 2)]!;
  return <>
    <div className="mk-history-controls">
      <label>Settlement date
        <select value={expiry} onChange={(event) => { setSelectedDate(Number(event.target.value)); setSelected(undefined); }}>
          {dates.map((date) => <option key={date} value={date}>{dateLabel(date)} · {timeLabel(date)}</option>)}
        </select>
      </label>
      <label>Strike
        <select value={contract.symbol} onChange={(event) => setSelected(event.target.value)}>
          {strikes.map((item) => <option key={item.symbol} value={item.symbol}>Above {usd(item.strike, 0)}</option>)}
        </select>
      </label>
      <Seg className="wc-tabs" buttonClass="wc-tab" label="Historical price side" value={side} onChange={setSide}
        options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
    </div>
    <ArchivedPriceChart key={contract.symbol} symbol={contract.symbol} side={side} />
  </>;
}

function PastUpDownPrices() {
  const [expanded, setExpanded] = useState(false);
  return <details className="p mk-history" onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary>Past BTC Up/Down prices</summary>
    {expanded && <UpDownArchive />}
  </details>;
}

function UpDownArchive() {
  const [contracts, setContracts] = useState<ArchivedUpDownContract[]>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [side, setSide] = useState<PositionSide>("yes");

  useEffect(() => {
    const controller = new AbortController();
    void getUpDownContracts(controller.signal)
      .then((value) => { if (!controller.signal.aborted) setContracts(value); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, []);

  if (error) return <p role="status">Couldn’t load past contracts. {error}</p>;
  if (!contracts) return <p role="status">Loading past contracts…</p>;
  const contract = contracts.find((item) => item.symbol === selected) ?? contracts[0];
  if (!contract) return <p role="status">No recorded contracts yet. Prices appear here after a tracked contract ends.</p>;

  return <>
    <div className="mk-history-controls">
      <label>Contract
        <select value={contract.symbol} onChange={(event) => setSelected(event.target.value)}>
          {contracts.map((item) => <option key={item.symbol} value={item.symbol}>
            {item.duration} · {dateLabel(item.expiryTs)} · {timeLabel(item.openTs)} to {timeLabel(item.expiryTs)} · {usd(item.strike)}
          </option>)}
        </select>
      </label>
      <Seg className="wc-tabs" buttonClass="wc-tab" label="Historical price side" value={side} onChange={setSide}
        options={[{ value: "yes", label: "Up" }, { value: "no", label: "Down" }]} />
    </div>
    <ArchivedPriceChart key={contract.symbol} symbol={contract.symbol} side={side} />
  </>;
}

function ArchivedPriceChart({ symbol, side }: { symbol: string; side: PositionSide }) {
  const { history, loading, error } = useMarketHistory(symbol);
  if (error) return <p role="status">Couldn’t load recorded prices. {error}</p>;
  if (loading) return <p role="status">Loading recorded prices…</p>;
  if (!history.length) return <p role="status">No recorded prices are available for this contract.</p>;

  const fair = new Map<number, number>();
  const gemini = new Map<number, number>();
  const bids = new Map<number, number>();
  const asks = new Map<number, number>();
  const upSide = side === "yes";
  const price = (up: number) => upSide ? up : 1 - up;
  for (const point of history) {
    const time = seconds(point.ts);
    fair.set(time, price(point.theo));
    if (!validQuote(point.geminiBid, point.geminiAsk, point.geminiMid)) continue;
    const bid = upSide ? point.geminiBid : point.geminiAsk;
    const ask = upSide ? point.geminiAsk : point.geminiBid;
    if (bid !== undefined) bids.set(time, price(bid));
    if (ask !== undefined) asks.set(time, price(ask));
    if (bid === undefined && ask === undefined && point.geminiMid !== undefined) gemini.set(time, price(point.geminiMid));
  }
  const points = (data: Map<number, number>) => Array.from(data, ([time, value]) => ({ time, value }));
  return <>
    <p>{bids.size || asks.size || gemini.size ? "Recorded Wick fair prices and Gemini quotes" : "Recorded Wick fair prices"}</p>
    {history.some((point) => point.reconstructed) && <p>Early Wick prices reconstructed from saved Deribit options.</p>}
    <WickChart historical format="cents" windows={[]} series={[
      { id: "wick", label: "Wick fair price", color: "#5fd4cc", data: points(fair) },
      ...(bids.size ? [{ id: "bid", label: "Gemini bid", color: "#9aa8ff", data: points(bids) }] : []),
      ...(asks.size ? [{ id: "ask", label: "Gemini ask", color: "#e6a474", data: points(asks) }] : []),
      ...(gemini.size ? [{ id: "gemini", label: "Gemini midpoint", color: "#7c87ab", data: points(gemini) }] : []),
    ]} />
  </>;
}

function Markets({ markets, health, symbol, error, sample, observedAt }: { markets: PricerMarket[]; health?: HealthView | undefined; symbol?: string | undefined; error?: string | undefined; sample: boolean; observedAt?: number | undefined }) {
  const [mode, setModeState] = useState<Mode>("pro");
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

  const groups = useMemo(() => {
    const visible = markets.map((market) => {
      const { ts, bid, ask, mid, last } = market.gemini;
      const age = now - ts;
      if (age >= -5_000 && age <= LIVE_QUOTE_MAX_AGE_MS && validQuote(bid, ask, mid)) return market;
      const withoutQuote = { ...market, gemini: { ts, ...(last === undefined ? {} : { last }) } };
      delete withoutQuote.edge;
      return withoutQuote;
    });
    return expiryGroups(visible, now);
  }, [markets, now]);
  // A duration tab follows rolling Up/Down windows. A dated strike or direct link always identifies one contract.
  const [selection, setSelection] = useState<{ symbol?: string; duration?: string }>(() => symbol ? { symbol } : {});
  const initialGroup = groups.find((item) => item.duration === "1d") ?? groups[0];
  const exact = selection.symbol;
  const group = exact ? groups.find((item) => item.markets.some((market) => market.symbol === exact))
    : selection.duration ? groups.find((item) => item.upDown && item.duration === selection.duration) : initialGroup;
  const rows = group?.markets ?? [];
  const selected = exact ? rows.find((market) => market.symbol === exact) : defaultStrike(rows);
  useEffect(() => {
    if (exact || selection.duration || !selected) return;
    setSelection(selected.kind === "up_down" ? { duration: selected.duration } : { symbol: selected.symbol });
  }, [exact, selection.duration, selected]);
  const { history, error: historyError } = useMarketHistory(sample ? "" : selected?.symbol ?? "");
  const allLadder = useMemo(() => markets.filter((market) => market.kind === "ladder"), [markets]);
  const sigma = (group && impliedVol(group.markets, now)) ?? impliedVol(allLadder, now) ?? .5;
  const spot = selected?.spot ?? markets[0]?.spot ?? 0;

  const spotSeed = useMemo(() => history.map((point: MarketHistoryPoint) => ({ time: seconds(point.ts), value: point.spot })), [history]);
  const spotTrail = useTrail(selected?.symbol ?? "", spotSeed, spot && observedAt !== undefined && !error
    ? { time: seconds(observedAt), value: spot } : undefined);

  const board = groups.length > 0 && <section className="mk-page market-board" aria-label="BTC markets">
    <h2>BTC markets</h2>
    <div className="market-board-grid">
      {groups.map((item) => <button type="button" key={item.id} aria-pressed={item.id === group?.id}
        aria-label={item.upDown ? `${item.duration} up/down` : undefined}
        onClick={() => {
          const strike = defaultStrike(item.markets);
          if (strike) setSelection(item.upDown ? { duration: item.duration } : { symbol: strike.symbol });
        }}>
        <b>{item.upDown ? `${item.label} Up/Down` : item.duration === "1h" ? `Hourly · ${item.label}` : item.label}</b>
        <small>{item.upDown ? `Ends ${timeLabel(item.expiryTs)}` : `${item.name} · ${item.markets.length} ${item.markets.length === 1 ? "strike" : "strikes"}`}</small>
        {!item.upDown && <small>{settlementUtc(item.expiryTs)}</small>}
      </button>)}
    </div>
  </section>;

  if (!group || !selected) return <>{board}<div className="mk-page pro"><section className="p mk-empty">
    {exact ? <>
      <h2>Contract unavailable for live pricing</h2><p>{exact}</p>
      {error && <p role="status">{error}</p>}
      <ArchivedPriceChart key={exact} symbol={exact} side="yes" />
    </> : <p role="status">{error ?? (selection.duration ? `Waiting for the next ${selection.duration} BTC Up/Down contract.` : "No live BTC markets are open right now.")}</p>}
  </section></div></>;

  const ticket: TicketState = {
    side, setSide, amount, setAmount,
    leverage: Math.min(leverage, selected.maxLeverage), setLeverage,
  };
  const choose = (next: string) => {
    setSelection({ symbol: next });
    const market = rows.find((item) => item.symbol === next);
    if (market) setLeverage((value) => Math.min(value, market.maxLeverage));
  };
  const live = isLive(selected, health, now, error);
  const pricingAge = health?.pricingAgeMs ?? health?.markAgeMs;
  const liveChartAt = !error && health?.ok && health.volHealthy && pricingAge !== undefined && pricingAge <= LIVE_MARK_MAX_AGE_MS
    && observedAt !== undefined && now - observedAt <= LIVE_MARK_MAX_AGE_MS ? observedAt : undefined;
  const shared = { group, rows, selected, spot, sigma, now, health, live, error, history, historyError, liveChartAt, ticket, choose, mode, setMode, spotTrail };
  return <>
    {board}
    {mode === "pro" ? <Pro {...shared} /> : <Easy {...shared} />}
  </>;
}

interface ViewProps {
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
  historyError?: string | undefined;
  liveChartAt?: number | undefined;
  ticket: TicketState;
  choose: (symbol: string) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  spotTrail: ChartPoint[];
}

const edgeClass = (edge: number | undefined) => edge === undefined || Math.abs(edge * 100) < .5 ? "gm" : edge > 0 ? "up" : "down";
const edgeText = (edge: number | undefined) => edge === undefined ? "–" : signed(edge * 100, (v) => v.toFixed(1));

function MarketChart({ rows, selected, choose, spotTrail, history, historyError, liveChartAt, className, height }: Pick<ViewProps, "rows" | "selected" | "choose" | "spotTrail" | "history" | "historyError" | "liveChartAt"> & {
  className: string;
  height: number;
}) {
  return <ContractPriceChart key={selected.kind} market={selected} strikes={rows} onStrikeChange={choose} history={history}
    spotTrail={spotTrail} historyError={historyError} observedAt={liveChartAt} className={className} height={height} />;
}

/* ================= PRO ================= */
function Pro(props: ViewProps) {
  const { group, rows, selected, spot, sigma, now, health, live, error, ticket, choose, mode, setMode, history } = props;
  const pricingAge = health?.pricingAgeMs ?? health?.markAgeMs;
  const [view, setView] = useState<"graph" | "table">("table");
  let spotRowDone = false;
  return <div className="mk-page pro">
    <div className="p stats">
      <div className="mk"><div className="coin sm" aria-hidden="true">₿</div><b>BTC</b></div>
      <div className="st"><span>Spot</span><b>{usd(spot)}</b></div>
      <div className="st"><span>Implied vol</span><b>{(sigma * 100).toFixed(1)}% · {cap(selected.volSource)}</b></div>
      <div className="st"><span>Price age</span><b>{pricingAge === undefined ? "—" : `${(pricingAge / 1000).toFixed(1)}s`}</b></div>
      <div className="st"><span>Prices</span><b className={live ? "live" : "stale"}>{live ? "Live" : "Stale"}</b></div>
      <div className="st"><span>Strikes</span><b>{rows.length}</b></div>
      <ModeSwitch mode={mode} onChange={setMode} />
    </div>
    {error && <p className="mk-notice" role="status">{error}</p>}
    <div className="p-grid">
      <div className="p-left">
        <MarketChart {...props} className="p p-chart" height={220} />
        <section className="p chain" aria-label="Strike chain">
          <div className="chain-top">
            <h2>{group.upDown ? `${group.label} Up/Down` : `Strikes · ${group.label}`}</h2>
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
        <div className="book-h"><b>{group.upDown ? marketName(group, selected) : `${usd(selected.strike, 0)} · ${group.label}`}</b><span>Gemini · YES · ¢</span></div>
        <Quote market={selected} now={now} />
      </section>
      <section className="p side-col" aria-label="Trade">
        <ProTicket market={selected} upDown={group.upDown} label={marketName(group, selected)} history={history} state={ticket} />
      </section>
    </div>
  </div>;
}

const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/* Gemini's top of book for the selected strike, drawn against Wick's fair price. */
function Quote({ market, now }: { market: PricerMarket; now: number }) {
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
  </div>;
}

/* ================= EASY ================= */
function Easy(props: ViewProps) {
  const { group, rows, selected, spot, sigma, now, live, error, ticket, choose, mode, setMode, spotTrail, history } = props;
  const [view, setView] = useState<"pick" | "list">("pick");
  const [showAll, setShowAll] = useState(false);
  const up = group.upDown;
  const when = group.duration === "1h" ? `at ${group.label}` : `on ${group.label}`;
  const title = up ? `BTC Up or Down · ${group.label}` : `Bitcoin above ___ ${when}?`;
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
        <div className="pb-stats">
          <div className="st"><span>Implied vol</span><b>{(sigma * 100).toFixed(1)}%</b></div>
          <div className="st"><span>Vol source</span><b>{cap(selected.volSource)}</b></div>
          <div className="st"><span>Strikes</span><b>{rows.length}</b></div>
          <div className="st"><span>Prices</span><b className={live ? "live" : "stale"}>{live ? "Live" : "Stale"}</b></div>
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
      <MarketChart {...props} className="p e-chartp" height={260} />
      {!up && <div className="pk-bar">
        <h2>Where will BTC be at {timeLabel(group.expiryTs)}{group.duration === "1h" ? "" : ` on ${dateLabel(group.expiryTs)}`}?</h2>
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
        <div className="pk-bar"><h2>Wick fair vs Gemini · {up ? `Up or Down · ${group.label}` : `Above ${usd(selected.strike, 0)}`}</h2>
          <span className="mu" style={{ fontSize: 13 }}>{up ? `Window ends ${timeLabel(group.expiryTs)}` : `Settles ${dateLabel(group.expiryTs)}, ${timeLabel(group.expiryTs)}`}</span></div>
        <div className="p stats ed-stats">
          <div className="st"><span>Chance</span><div className="big">{Math.round(selected.theo * 100)}%<small>{up ? "Up" : "Yes"}</small></div></div>
          <div className="st"><span>Wick fair price</span><b style={{ color: "var(--wick)" }}>{cents(selected.theo)}</b></div>
          <div className="st"><span>Gemini bid / ask</span><b>{selected.gemini.bid === undefined && selected.gemini.ask === undefined ? "No quote" : `${cents(selected.gemini.bid)} / ${cents(selected.gemini.ask)}`}</b></div>
          <div className="st"><span>Edge vs Gemini mid</span><b className={edgeClass(edge)}>{edge === undefined ? "–" : signed(edge * 100, (v) => `${v.toFixed(1)}¢`)}</b></div>
          <div className="st"><span>Leverage cap</span><b>{selected.maxLeverage}x</b></div>
        </div>
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
