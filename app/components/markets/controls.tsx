"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { clockParts } from "@/lib/markets";

const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

/* Segmented control whose highlight slides between options (after Benji Taylor's Stageshow Segmented). */
export function Seg<T extends string>({ options, value, onChange, className, label, buttonClass }: {
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  className: string;
  label: string;
  buttonClass?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const ind = useRef<HTMLElement>(null);
  const moved = useRef(false);
  const place = useCallback(() => {
    const box = host.current; const mark = ind.current;
    if (!box || !mark) return;
    const on = box.querySelector<HTMLElement>('button[aria-pressed="true"]');
    if (!on) { mark.style.opacity = "0"; return; }
    if (!moved.current) mark.style.transition = "none";
    mark.style.width = `${on.offsetWidth}px`;
    mark.style.height = `${on.offsetHeight}px`;
    mark.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
    mark.style.opacity = "1";
    if (!moved.current) { void mark.offsetWidth; mark.style.transition = ""; moved.current = true; }
  }, []);
  useIsoLayout(place);
  useEffect(() => {
    if (typeof ResizeObserver === "undefined" || !host.current) return undefined;
    const observer = new ResizeObserver(place);
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [place]);
  return <div ref={host} className={`${className} seg-host`} role="group" aria-label={label}>
    {options.map((option) => <button type="button" key={option.value} className={buttonClass} aria-pressed={option.value === value}
      onClick={() => onChange(option.value)}>{option.label}</button>)}
    <i ref={ind} className="ind" aria-hidden="true" />
  </div>;
}

export function ModeSwitch({ mode, onChange, className = "" }: { mode: "easy" | "pro"; onChange: (mode: "easy" | "pro") => void; className?: string }) {
  return <Seg className={`mk-mode ${className}`} label="Interface mode" value={mode} onChange={onChange}
    options={[{ value: "easy", label: "Easy" }, { value: "pro", label: "Pro" }]} />;
}

export function Clock({ msLeft }: { msLeft: number }) {
  return <div className="mk-clock" aria-label="Time left">
    {clockParts(msLeft).map(([value, unit]) => <div key={unit}><b>{value}</b><span>{unit}</span></div>)}
  </div>;
}

/* Leverage slider: drags continuously, snaps to a whole leverage on release, log scale for large caps. */
function scale(cap: number) {
  return cap > 30
    ? { p: (v: number) => Math.log(v) / Math.log(cap), v: (p: number) => Math.exp(p * Math.log(cap)) }
    : { p: (v: number) => (v - 1) / Math.max(1, cap - 1), v: (p: number) => 1 + p * (cap - 1) };
}

function marks(cap: number) {
  const sc = scale(cap);
  const nice = cap > 30 ? [1, 2, 5, 10, 25, 50, 100, 200] : [1, Math.round(cap / 4), Math.round(cap / 2), Math.round(cap * 3 / 4)];
  const out: number[] = [];
  for (const v of [...new Set(nice.filter((item) => item >= 1 && item < cap))]) {
    if (!out.length || sc.p(v) - sc.p(out[out.length - 1]!) > .14) out.push(v);
  }
  if (out.length && 1 - sc.p(out[out.length - 1]!) < .14) out.pop();
  out.push(cap);
  return out;
}

export function LevSlider({ cap, value, onChange }: { cap: number; value: number; onChange: (value: number) => void }) {
  const sc = scale(Math.max(cap, 1));
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number>();
  const [text, setText] = useState<string>();
  const clamp = (v: number) => Math.max(1, Math.min(cap, Math.round(v)));
  const position = drag ?? (cap > 1 ? sc.p(Math.min(value, cap)) : 1);
  const fromX = (x: number) => {
    const rect = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - rect.left) / Math.max(rect.width, 1)));
  };
  const list = cap > 1 ? marks(cap) : [1];
  return <div className="lv">
    <div ref={track} className={`lv-track${drag === undefined ? " snap" : " drag"}`} role="slider" tabIndex={0} aria-label="Leverage"
      aria-valuemin={1} aria-valuemax={cap} aria-valuenow={value} style={{ ["--p" as string]: position }}
      onPointerDown={(event) => {
        const lab = (event.target as HTMLElement).closest<HTMLElement>(".lv-lab");
        if (lab) { onChange(clamp(Number(lab.dataset.v))); return; }
        if (cap <= 1) return;
        event.preventDefault();
        track.current?.setPointerCapture?.(event.pointerId);
        const p = fromX(event.clientX); setDrag(p); onChange(clamp(sc.v(p)));
      }}
      onPointerMove={(event) => { if (drag === undefined) return; const p = fromX(event.clientX); setDrag(p); onChange(clamp(sc.v(p))); }}
      onPointerUp={() => setDrag(undefined)} onPointerCancel={() => setDrag(undefined)}
      onKeyDown={(event) => {
        const step = ({ ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 } as Record<string, number>)[event.key];
        if (event.key === "Home") { event.preventDefault(); onChange(1); }
        else if (event.key === "End") { event.preventDefault(); onChange(cap); }
        else if (step) { event.preventDefault(); onChange(clamp(value + step)); }
      }}>
      <div className="lv-rail" /><div className="lv-fill" />
      {list.map((v, index) => <span key={v}>
        <i className={`lv-tick${v <= value ? " on" : ""}`} style={{ left: `${(cap > 1 ? sc.p(v) : 1) * 100}%` }} />
        <span className={`lv-lab${index === 0 ? " first" : index === list.length - 1 ? " last" : ""}${v <= value ? " on" : ""}`} data-v={v}
          style={{ left: `${(cap > 1 ? sc.p(v) : 1) * 100}%` }}>{v}x</span>
      </span>)}
      <div className="lv-thumb" />
    </div>
    <label className="lv-val">
      <input inputMode="numeric" aria-label={`Leverage, 1 to ${cap}`} value={text ?? String(value)}
        onFocus={(event) => event.target.select()}
        onChange={(event) => setText(event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
        onBlur={() => { if (text !== undefined) onChange(clamp(Number(text) || value)); setText(undefined); }}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          if (event.key === "ArrowUp") { event.preventDefault(); onChange(clamp(value + 1)); }
          if (event.key === "ArrowDown") { event.preventDefault(); onChange(clamp(value - 1)); }
        }} />
      <span>x</span>
    </label>
  </div>;
}

/* An input sized to its own text, measured with a hidden mirror so kerning and tabular figures match. */
export function FitInput(props: React.InputHTMLAttributes<HTMLInputElement> & { value: string }) {
  const input = useRef<HTMLInputElement>(null);
  const mirror = useRef<HTMLSpanElement>(null);
  useIsoLayout(() => {
    if (!input.current || !mirror.current) return;
    input.current.style.width = `${Math.ceil(mirror.current.getBoundingClientRect().width + 2)}px`;
  });
  return <>
    <input ref={input} {...props} />
    <span ref={mirror} aria-hidden="true" className="fit-mirror">{props.value || "0"}</span>
  </>;
}
