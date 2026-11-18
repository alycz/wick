import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Liveline } from "liveline";
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, ColorType, LineStyle, CrosshairMode } from "lightweight-charts";

const C = { bg: "#0b0e11", grid: "#1a1f24", text: "#8e979f", up: "#22c55e", down: "#f0505d" };
const fmtUsd = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK = (v) => { const a = Math.abs(v), sg = v < 0 ? "\u2212" : ""; return sg + "$" + (a >= 1e6 ? (a / 1e6).toFixed(2) + "M" : a >= 1e4 ? (a / 1e3).toFixed(1) + "k" : a.toLocaleString("en-US", { maximumFractionDigits: 0 })); };
const fmtC = (v) => (v * 100).toFixed(1) + "¢";

function TV({ p }) {
  const box = useRef(null), st = useRef({});
  useEffect(() => {
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: C.text, fontFamily: "Inter, system-ui, sans-serif", fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: C.grid },
      timeScale: { borderColor: C.grid, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { priceFormatter: p.format === "cents" ? fmtC : (v) => v.toLocaleString("en-US", { maximumFractionDigits: 0 }) },
    });
    const s = { chart };
    if (p.series) {
      s.lines = p.series.map((x) => chart.addSeries(LineSeries, { color: x.color, lineWidth: 2, title: x.label, priceLineVisible: false }));
    } else {
      s.candle = chart.addSeries(CandlestickSeries, { upColor: C.up, downColor: C.down, borderVisible: false, wickUpColor: C.up, wickDownColor: C.down });
      s.vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" });
      s.vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    }
    st.current = s;
    return () => chart.remove();
  }, [!!p.series]);
  useEffect(() => {
    const s = st.current; if (!s.chart) return;
    if (p.series && s.lines) p.series.forEach((x, i) => s.lines[i]?.setData(x.data));
    if (!p.series && s.candle) {
      const raw = p.liveCandle ? [...p.candles, p.liveCandle] : p.candles;
      const iv = p.agg || 0;
      let all = raw;
      if (iv > 60) { all = []; let cur = null; raw.forEach((c) => { const t = Math.floor(c.time / iv) * iv; if (!cur || cur.time !== t) { cur = { time: t, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0 }; all.push(cur); } else { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; cur.volume += c.volume ?? 0; } }); }
      s.candle.setData(all);
      s.vol.setData(all.map((c) => ({ time: c.time, value: c.volume ?? 0, color: c.close >= c.open ? "rgba(34,197,94,.35)" : "rgba(240,80,93,.35)" })));
      if (s.ref) { s.candle.removePriceLine(s.ref); s.ref = null; }
      if (p.refLine) s.ref = s.candle.createPriceLine({ price: p.refLine.value, color: "#8e979f", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: p.refLine.label ?? "" });
    }
    const key = (p.agg || 0) + ":" + (p.win || 0);
    if (s.fitted !== key) {
      s.fitted = key;
      if (p.agg) { const n = s.candle.data().length; s.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 90), to: n + 3 }); }
      else s.chart.timeScale().fitContent();
    }
  });
  return <div ref={box} style={{ position: "absolute", inset: 0 }} />;
}

function Box({ p }) {
  const [mode, setMode] = useState(p.initial ?? "live");
  const [win, setWin] = useState(p.window ?? 300);
  useEffect(() => { if (p.bare && p.window) setWin(p.window); }, [p.window]);
  useEffect(() => { if (p.bare && p.mode) setMode(p.mode); }, [p.mode]);
  const bot = p.variant === "bot";
  const ICON = {
    live: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 11.5 5.5 7l3 3 6-6.5"/></svg>,
    tv: <svg viewBox="0 0 16 16" fill="currentColor"><rect x="2.5" y="4" width="3" height="7" rx=".6"/><rect x="3.6" y="2" width=".8" height="11"/><rect x="10.5" y="6" width="3" height="5" rx=".6"/><rect x="11.6" y="4" width=".8" height="9"/></svg>,
  };
  const tab = (m, label) => bot
    ? <button type="button" key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className="wc-tab wc-ico" aria-label={m === "live" ? "Line chart (Liveline)" : "Candles (TradingView)"} title={m === "live" ? "Line · Liveline" : "Candles · TradingView"}>{ICON[m]}</button>
    : <button type="button" key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className="wc-tab">{label}</button>;
  const fmt = p.format === "cents" ? fmtC : p.format === "usdk" ? fmtK : fmtUsd;
  const wins = p.windows || [];
  // keep the reference line only when it sits near the visible prices, so a far strike does not flatten the line
  let ref = p.refLine;
  if (ref && p.ticks && !p.series) {
    const last = p.ticks[p.ticks.length - 1]?.time ?? 0;
    const vis = p.ticks.filter((t) => t.time >= last - win);
    let lo = Infinity, hi = -Infinity; vis.forEach((t) => { lo = Math.min(lo, t.value); hi = Math.max(hi, t.value); });
    const pad = Math.max((hi - lo) * 0.6, Math.abs(hi) * 0.0008);
    if (ref.value < lo - pad || ref.value > hi + pad) ref = undefined;
  }
  const isCandle = !p.series && p.candles;
  return <div className={bot ? "wc bot" : "wc"}>
    {p.bare ? null : <div className="wc-bar">
      {wins.length ? <div className={bot ? "wc-tabs tx" : "wc-tabs"} role="group" aria-label={mode === "tv" && isCandle ? "Candle interval" : "Time window"}>{wins.map((w) => <button type="button" key={w.secs} className="wc-tab" aria-pressed={win === w.secs} onClick={() => setWin(w.secs)}>{bot ? w.label.toUpperCase() : w.label}</button>)}</div> : <span />}
      {p.legend ? <div className="wc-legend">{p.legend}</div> : null}
      <div className="wc-tabs" role="group" aria-label="Chart type">{tab("live", "Live")}{tab("tv", "TradingView")}</div>
    </div>}
    <div className="wc-area" style={{ height: p.height ?? 220 }}>
      {mode === "live"
        ? (p.series
          ? <Liveline series={p.series.map((x) => ({ id: x.id, data: x.data, value: x.value, color: x.color, label: x.label }))} theme="dark" formatValue={fmt} window={win} grid formatTime={p.formatTime} />
          : <Liveline data={p.ticks} value={p.value} color={p.color ?? "#f7931a"} theme="dark" formatValue={fmt} window={win} referenceLine={ref} formatTime={p.formatTime} exaggerate={p.exaggerate} badgeVariant="default" />)
        : <TV p={{ ...p, win, agg: isCandle && p.tvInterval ? win : 0 }} />}
    </div>
  </div>;
}

window.WickChart = {
  mount(el, props) {
    const root = createRoot(el);
    let cur = props;
    root.render(<Box p={cur} />);
    return { update(next) { cur = { ...cur, ...next }; root.render(<Box p={cur} />); }, destroy() { root.unmount(); } };
  },
};
