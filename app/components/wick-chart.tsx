"use client";

import { ColorType, CrosshairMode, LineSeries, LineStyle, createChart, type IChartApi, type ISeriesApi, type IPriceLine, type UTCTimestamp } from "lightweight-charts";
import { Liveline } from "liveline";
import { useEffect, useRef, useState, type ReactNode } from "react";

/* One chart box with two renderers: Liveline (live, animated) and TradingView lightweight-charts.
   Time is in seconds. Values are dollars ("usd") or probabilities 0–1 ("cents"). */

export interface ChartPoint { time: number; value: number }
export interface ChartSeries { id: string; label: string; color: string; data: ChartPoint[] }
export interface ChartWindow { label: string; secs: number }

const GRID = "#1a1f24";
const TEXT = "#8e979f";
/* millions read as $4.50M so the axis fits, and the minus sign sits before the $ */
const usd = (value: number) => {
  const abs = Math.abs(value), sign = value < 0 ? "−" : "";
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const cents = (value: number) => `${(value * 100).toFixed(1)}¢`;

function TradingView({ series, format, refLine }: { series: ChartSeries[]; format: "usd" | "cents"; refLine?: { value: number; label?: string } }) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi>();
  const lines = useRef<Array<ISeriesApi<"Line">>>([]);
  const ref = useRef<IPriceLine>();
  const fitted = useRef(false);
  const shape = series.map((item) => item.id).join();

  useEffect(() => {
    if (!box.current) return undefined;
    const instance = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: TEXT, fontFamily: "Inter, system-ui, sans-serif", fontSize: 11 },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      rightPriceScale: { borderColor: GRID },
      timeScale: { borderColor: GRID, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { priceFormatter: format === "cents" ? cents : (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 0 }) },
    });
    chart.current = instance;
    lines.current = series.map((item) => instance.addSeries(LineSeries, { color: item.color, lineWidth: 2, title: item.label, priceLineVisible: false }));
    fitted.current = false;
    return () => { instance.remove(); chart.current = undefined; ref.current = undefined; };
    // the series list (not its data) decides the chart's structure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, format]);

  useEffect(() => {
    series.forEach((item, index) => lines.current[index]?.setData(item.data.map((point) => ({ time: point.time as UTCTimestamp, value: point.value }))));
    const first = lines.current[0];
    if (first) {
      if (ref.current) { first.removePriceLine(ref.current); ref.current = undefined; }
      if (refLine) ref.current = first.createPriceLine({ price: refLine.value, color: TEXT, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: refLine.label ?? "" });
    }
    if (!fitted.current && series.some((item) => item.data.length > 1)) { chart.current?.timeScale().fitContent(); fitted.current = true; }
  });

  return <div ref={box} className="wc-tv" />;
}

/* value of a series at a time: the last point at or before it */
function valueAt(data: ChartPoint[], time: number): number | undefined {
  let lo = 0, hi = data.length - 1, found: number | undefined;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (data[mid]!.time <= time) { found = data[mid]!.value; lo = mid + 1; } else hi = mid - 1; }
  return found;
}
const clockTime = (time: number) => new Date(time * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });

/* Hover card drawn over the Liveline canvas: time on top, then each series with its value. */
function HoverCard({ hover, series, fmt, formatTime, width }: { hover: { time: number; x: number }; series: ChartSeries[]; fmt: (v: number) => string; formatTime?: (t: number) => string; width: number }) {
  const rows = series.map((item) => ({ item, value: valueAt(item.data, hover.time) })).filter((row) => row.value !== undefined);
  if (!rows.length) return null;
  const cardW = series.length > 1 ? 188 : 150;
  const flip = hover.x + 14 + cardW > width - 8;
  const left = flip ? Math.max(8, hover.x - 14 - cardW) : hover.x + 14;
  return <div className="wc-tip" style={{ left, width: cardW }} role="status">
    <span className="wc-tip-t">{(formatTime ?? clockTime)(hover.time)}</span>
    {rows.map(({ item, value }) => <div className="wc-tip-r" key={item.id}>
      {series.length > 1 ? <span><i style={{ background: item.color }} />{item.label}</span> : null}
      <b>{fmt(value!)}</b>
    </div>)}
  </div>;
}

export function WickChart({ series, format, windows, height = 220, refLine, legend, color, formatTime, initialWindow }: {
  series: ChartSeries[];
  format: "usd" | "cents";
  windows: ChartWindow[];
  height?: number;
  refLine?: { value: number; label?: string };
  legend?: ReactNode;
  color?: string;
  formatTime?: (time: number) => string;
  initialWindow?: number;
}) {
  const [mode, setMode] = useState<"live" | "tv">("live");
  const [win, setWin] = useState(initialWindow ?? windows[Math.min(1, windows.length - 1)]?.secs ?? 300);
  const fmt = format === "cents" ? cents : usd;
  const single = series.length === 1 ? series[0] : undefined;
  const empty = series.every((item) => item.data.length < 2);
  const [hover, setHover] = useState<{ time: number; x: number }>();
  const area = useRef<HTMLDivElement>(null);
  const onHover = (point: { time: number; x: number } | null) => setHover(point ? { time: point.time, x: point.x } : undefined);
  /* Liveline draws its own one-line readout; push it off the canvas and show the hover card instead */
  const hoverProps = { onHover, tooltipY: -10_000 };

  // keep a reference line only when it sits near the visible values, so a far strike does not flatten the line
  let ref = refLine;
  if (ref && single && single.data.length) {
    const last = single.data[single.data.length - 1]!.time;
    const visible = single.data.filter((point) => point.time >= last - win).map((point) => point.value);
    const low = Math.min(...visible); const high = Math.max(...visible);
    const pad = Math.max((high - low) * .6, Math.abs(high) * .0008);
    if (ref.value < low - pad || ref.value > high + pad) ref = undefined;
  }

  return <div className="wc">
    <div className="wc-bar">
      <div className="wc-tabs" role="group" aria-label="Time window">
        {windows.map((item) => <button type="button" key={item.secs} className="wc-tab" aria-pressed={win === item.secs} onClick={() => setWin(item.secs)}>{item.label}</button>)}
      </div>
      {legend ? <div className="wc-legend">{legend}</div> : null}
      <div className="wc-tabs" role="group" aria-label="Chart type">
        <button type="button" className="wc-tab" aria-pressed={mode === "live"} onClick={() => setMode("live")}>Live</button>
        <button type="button" className="wc-tab" aria-pressed={mode === "tv"} onClick={() => setMode("tv")}>TradingView</button>
      </div>
    </div>
    <div className="wc-area" style={{ height }} ref={area} onMouseLeave={() => setHover(undefined)}>
      {empty ? <div className="wc-empty">Waiting for live prices.</div> : mode === "live"
        ? single
          ? <Liveline data={single.data} value={single.data[single.data.length - 1]!.value} color={color ?? single.color} theme="dark" formatValue={fmt} window={win} {...(formatTime ? { formatTime } : {})}
            {...(ref ? { referenceLine: ref } : {})} badgeVariant="default" {...hoverProps} />
          : <Liveline data={series[0]!.data} value={series[0]!.data[series[0]!.data.length - 1]?.value ?? 0} theme="dark" formatValue={fmt} window={win} grid {...(formatTime ? { formatTime } : {})}
            series={series.map((item) => ({ id: item.id, label: item.label, color: item.color, data: item.data, value: item.data[item.data.length - 1]?.value ?? 0 }))} {...hoverProps} />
        : <TradingView series={series} format={format} {...(ref ? { refLine: ref } : {})} />}
      {mode === "live" && hover && !empty ? <HoverCard hover={hover} series={series} fmt={fmt} width={area.current?.clientWidth ?? 0} {...(formatTime ? { formatTime } : {})} /> : null}
    </div>
  </div>;
}
