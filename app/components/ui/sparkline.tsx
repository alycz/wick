"use client";

import { useId } from "react";

/* A small area sparkline. The line draws itself in on mount and a dot marks the latest value. */
export function Sparkline({ values, color = "#5fd4cc", width = 120, height = 36, min, max }: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  min?: number;
  max?: number;
}) {
  const gradient = useId().replace(/:/g, "");
  if (values.length < 2) return <svg className="spark" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    <line x1="0" x2={width} y1={height / 2} y2={height / 2} stroke="var(--line-strong)" strokeDasharray="2 4" />
  </svg>;
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const span = hi - lo || 1;
  const pad = 3;
  const x = (index: number) => index / (values.length - 1) * width;
  const y = (value: number) => pad + (1 - (value - lo) / span) * (height - pad * 2);
  const points = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`);
  const line = `M${points.join("L")}`;
  const last = values[values.length - 1]!;
  return <svg className="spark" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
    <path className="spark-area" d={`${line}L${width},${height}L0,${height}Z`} fill={`url(#${gradient})`} />
    <path className="spark-line" d={line} stroke={color} pathLength={1} strokeDasharray="1" />
    <circle className="spark-dot" cx={width} cy={y(last)} r="2.6" fill={color} />
  </svg>;
}
