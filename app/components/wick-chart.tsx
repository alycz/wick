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
const usd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    <div className="wc-area" style={{ height }}>
      {empty ? <div className="wc-empty">Waiting for live prices.</div> : mode === "live"
        ? single
          ? <Liveline data={single.data} value={single.data[single.data.length - 1]!.value} color={color ?? single.color} theme="dark" formatValue={fmt} window={win} {...(formatTime ? { formatTime } : {})}
            {...(ref ? { referenceLine: ref } : {})} badgeVariant="default" />
          : <Liveline data={series[0]!.data} value={series[0]!.data[series[0]!.data.length - 1]?.value ?? 0} theme="dark" formatValue={fmt} window={win} grid {...(formatTime ? { formatTime } : {})}
            series={series.map((item) => ({ id: item.id, label: item.label, color: item.color, data: item.data, value: item.data[item.data.length - 1]?.value ?? 0 }))} />
        : <TradingView series={series} format={format} {...(ref ? { refLine: ref } : {})} />}
    </div>
  </div>;
}
