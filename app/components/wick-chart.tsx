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
  const earliestFitted = useRef<number>();
  const shape = series.map((item) => item.id).join();

  useEffect(() => {
    if (!box.current) return undefined;
    const instance = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: TEXT, fontFamily: "Inter, system-ui, sans-serif", fontSize: 11 },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      rightPriceScale: { borderColor: GRID, ...(format === "cents" ? { scaleMargins: { top: .04, bottom: .04 } } : {}) },
      timeScale: { borderColor: GRID, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { priceFormatter: format === "cents" ? cents : (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 0 }) },
    });
    chart.current = instance;
    lines.current = series.map((item) => {
      const sampledQuote = format === "cents" && item.id !== "theo" && item.id !== "wick";
      return instance.addSeries(LineSeries, {
        color: item.color, lineWidth: 2, title: item.label, priceLineVisible: false,
        lineVisible: !sampledQuote, pointMarkersVisible: sampledQuote, pointMarkersRadius: 2,
        lastValueVisible: !sampledQuote,
        ...(format === "cents" ? {
          priceFormat: { type: "custom", formatter: cents, minMove: .001 },
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 1 } }),
        } : {}),
      });
    });
    earliestFitted.current = undefined;
    /* the axis is measured with the fallback font if Inter is still loading; measure again once it is ready */
    void document.fonts?.ready.then(() => { if (chart.current === instance) { instance.applyOptions({}); instance.priceScale("right").applyOptions({}); } }).catch(() => undefined);
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
    const earliest = Math.min(...series.map((item) => item.data[0]?.time ?? Infinity));
    if (series.some((item) => item.data.length > 1) && Number.isFinite(earliest) && (earliestFitted.current === undefined || earliest < earliestFitted.current)) {
      chart.current?.timeScale().fitContent();
      earliestFitted.current = earliest;
    }
  });

  return <div ref={box} className="wc-tv" />;
}

/* Liveline reserves a fixed 80px for its value badge; wide dollar values need more or the badge is cut off */
function badgeRoom(data: ChartPoint[], fmt: (value: number) => string) {
  const widest = Math.max(...data.slice(-200).map((point) => fmt(point.value).length));
  return Math.max(80, Math.ceil(widest * 7.4 + 30));
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

export type ChartMode = "live" | "tv";

/* Live (Liveline) or TradingView; exported so a page can place it beside its own controls */
export function ChartTypeToggle({ mode, onMode }: { mode: ChartMode; onMode: (mode: ChartMode) => void }) {
  return <div className="wc-tabs" role="group" aria-label="Chart type">
    <button type="button" className="wc-tab" aria-pressed={mode === "live"} onClick={() => onMode("live")}>Live</button>
    <button type="button" className="wc-tab" aria-pressed={mode === "tv"} onClick={() => onMode("tv")}>TradingView</button>
  </div>;
}

export function WickChart({ series, format, windows, height = 220, refLine, legend, color, formatTime, initialWindow, followFullWindow = false, historical = false, header, mode: modeProp, onMode }: {
  series: ChartSeries[];
  format: "usd" | "cents";
  windows: ChartWindow[];
  height?: number;
  refLine?: { value: number; label?: string };
  legend?: ReactNode;
  color?: string;
  formatTime?: (time: number) => string;
  initialWindow?: number;
  followFullWindow?: boolean;
  historical?: boolean;
  /** lay out the chart's controls yourself: receives the time-window tabs and the Live/TradingView toggle */
  header?: (controls: { windows: ReactNode; type: ReactNode }) => ReactNode;
  /** controlled chart type */
  mode?: ChartMode;
  onMode?: (mode: ChartMode) => void;
}) {
  const [ownMode, setOwnMode] = useState<ChartMode>("live");
  const mode = modeProp ?? ownMode;
  const setMode = onMode ?? setOwnMode;
  const [range, setRange] = useState<number | undefined>(followFullWindow ? undefined : initialWindow ?? windows[Math.min(1, windows.length - 1)]?.secs);
  const full = windows.at(-1);
  const fmt = format === "cents" ? cents : usd;
  const empty = series.every((item) => item.data.length < 2);
  const animated = mode === "live";
  /* Liveline draws against the wall clock, so a finished (historical) series is shifted to end now, frozen, and its
     times are shifted back for labels and the hover card */
  const [shiftNow] = useState(() => Math.floor(Date.now() / 1000));
  const lastTime = Math.max(...series.map((item) => item.data.at(-1)?.time ?? 0));
  const firstTime = Math.min(...series.map((item) => item.data[0]?.time ?? Infinity));
  const offset = historical && animated && !empty ? shiftNow - lastTime : 0;
  const drawn = offset ? series.map((item) => ({ ...item, data: item.data.map((point) => ({ time: point.time + offset, value: point.value })) })) : series;
  const single = drawn.length === 1 ? drawn[0] : undefined;
  const timeLabel = formatTime ?? (historical ? clockTime : undefined);
  const shownTime = timeLabel && offset ? (time: number) => timeLabel(time - offset) : timeLabel;
  const win = historical ? Math.max(60, Math.ceil((lastTime - firstTime) * 1.04)) : range ?? full?.secs ?? 300;
  const [hover, setHover] = useState<{ time: number; x: number }>();
  const area = useRef<HTMLDivElement>(null);
  const onHover = (point: { time: number; x: number } | null) => setHover(point ? { time: point.time, x: point.x } : undefined);
  /* Liveline draws its own one-line readout; push it off the canvas and show the hover card instead */
  const hoverProps = { onHover, tooltipY: -10_000 };
  const displayed = !historical && !animated && range !== undefined
    ? series.map((item) => ({ ...item, data: item.data.filter((point) => point.time >= lastTime - win) })) : series;

  // keep a reference line only when it sits near the visible values, so a far strike does not flatten the line
  let ref = refLine;
  if (ref && single && single.data.length) {
    const last = single.data[single.data.length - 1]!.time;
    const visible = single.data.filter((point) => point.time >= last - win).map((point) => point.value);
    const low = Math.min(...visible); const high = Math.max(...visible);
    const pad = Math.max((high - low) * .6, Math.abs(high) * .0008);
    if (ref.value < low - pad || ref.value > high + pad) ref = undefined;
  }

  const windowTabs = windows.length > 0 ? <div className="wc-tabs" role="group" aria-label="Time window">
    {windows.map((item) => {
      const choice = followFullWindow && item === full ? undefined : item.secs;
      return <button type="button" key={item.label} className="wc-tab" aria-pressed={range === choice} onClick={() => setRange(choice)}>{item.label}</button>;
    })}
  </div> : null;
  const typeToggle = <ChartTypeToggle mode={mode} onMode={setMode} />;
  const liveProps = { theme: "dark" as const, formatValue: fmt, window: win, ...(shownTime ? { formatTime: shownTime } : {}), ...(historical ? { paused: true } : {}) };

  return <div className="wc">
    {header ? header({ windows: windowTabs, type: typeToggle }) : !historical && <div className="wc-bar">
      {windowTabs}
      {legend ? <div className="wc-legend">{legend}</div> : null}
      {typeToggle}
    </div>}
    <div className="wc-area" style={{ height }} ref={area} onMouseLeave={() => setHover(undefined)}>
      {empty ? <div className="wc-empty">{historical ? "Too few recorded prices to draw a chart." : "Waiting for live prices."}</div> : animated
        ? single
          ? <Liveline key={offset ? "past" : "live"} data={single.data} value={single.data[single.data.length - 1]!.value} color={color ?? single.color} {...liveProps} padding={{ right: badgeRoom(single.data, fmt) }}
            {...(ref ? { referenceLine: ref } : {})} badgeVariant="default" {...hoverProps} />
          : <Liveline data={drawn[0]!.data} value={drawn[0]!.data[drawn[0]!.data.length - 1]?.value ?? 0} {...liveProps} grid
            series={drawn.map((item) => ({ id: item.id, label: item.label, color: item.color, data: item.data, value: item.data[item.data.length - 1]?.value ?? 0 }))} {...hoverProps} />
        : <TradingView key={range ?? "all"} series={displayed} format={format} {...(ref ? { refLine: ref } : {})} />}
      {animated && hover && !empty ? <HoverCard hover={hover} series={drawn} fmt={fmt} width={area.current?.clientWidth ?? 0} {...(shownTime ? { formatTime: shownTime } : {})} /> : null}
    </div>
  </div>;
}
