"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChartPoint } from "@/components/wick-chart";

const NO_POINTS: ChartPoint[] = [];

export function usePriceTrail(key: string, seed: ChartPoint[], live: ChartPoint | undefined): ChartPoint[] {
  const [trail, setTrail] = useState<{ key: string; points: ChartPoint[] }>();
  const time = live?.time;
  const value = live?.value;
  useEffect(() => {
    if (time === undefined || value === undefined || !Number.isFinite(time) || !Number.isFinite(value)) return;
    setTrail((current) => {
      const previous = current?.key === key ? current.points : NO_POINTS;
      const last = previous.at(-1);
      if (last && time < last.time) return current;
      if (last?.time === time) {
        return last.value === value ? current : { key, points: [...previous.slice(0, -1), { time, value }] };
      }
      return { key, points: [...previous.slice(-3599), { time, value }] };
    });
  }, [key, time, value]);

  const livePoints = trail?.key === key ? trail.points : NO_POINTS;
  return useMemo(() => {
    if (!livePoints.length && !seed.length) return NO_POINTS;
    const merged = new Map<number, number>();
    for (const point of seed) merged.set(point.time, point.value);
    for (const point of livePoints) merged.set(point.time, point.value);
    return [...merged].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
  }, [seed, livePoints]);
}
