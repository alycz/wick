"use client";

import { marketsResponseSchema, type MarketHistoryPoint, type PricerMarket } from "@wick/shared";
import { useEffect, useMemo, useState } from "react";
import { backendConfigured, backendUrl, getHealth, getHistory, getMarkets, type HealthView } from "@/lib/api";

export function useMarkets(): { markets: PricerMarket[]; loading: boolean; error?: string } {
  const [markets, setMarkets] = useState<PricerMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    let socket: WebSocket | undefined;
    if (!backendConfigured()) {
      setError("Backend is not configured. Set NEXT_PUBLIC_BACKEND_URL to load live markets.");
      setLoading(false);
      return () => controller.abort();
    }
    void getMarkets(controller.signal)
      .then((value) => { setMarkets(value); setError(undefined); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    try {
      const url = new URL(backendUrl("/stream"));
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(url);
      socket.addEventListener("message", (message) => {
        try {
          const envelope = JSON.parse(String(message.data)) as { type?: unknown; data?: unknown };
          if (envelope.type === "markets") {
            setMarkets(marketsResponseSchema.parse(envelope.data) as unknown as PricerMarket[]);
            setError(undefined);
          }
        } catch { /* REST snapshot remains authoritative on malformed frames */ }
      });
      socket.addEventListener("error", () => setError("Live market stream disconnected; showing the last verified snapshot."));
    } catch { /* initial REST request still provides data */ }
    return () => { controller.abort(); socket?.close(); };
  }, []);

  return error === undefined ? { markets, loading } : { markets, loading, error };
}

export function useMarket(symbol: string) {
  const state = useMarkets();
  return { ...state, market: useMemo(() => state.markets.find((item) => item.symbol === symbol), [state.markets, symbol]) };
}

export function useMarketHistory(symbol: string): { history: MarketHistoryPoint[]; error?: string } {
  const [history, setHistory] = useState<MarketHistoryPoint[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    if (!backendConfigured()) { setError("Backend is not configured."); return () => controller.abort(); }
    void getHistory(symbol, controller.signal)
      .then((value) => { setHistory(value); setError(undefined); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => controller.abort();
  }, [symbol]);
  return error === undefined ? { history } : { history, error };
}

export function useHealth(): { health?: HealthView; error?: string } {
  const [health, setHealth] = useState<HealthView>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!backendConfigured()) {
      setError("Backend health unavailable until NEXT_PUBLIC_BACKEND_URL is configured.");
      return;
    }
    const controller = new AbortController();
    const refresh = () => void getHealth(controller.signal)
      .then((value) => { setHealth(value); setError(undefined); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);
  if (health && error) return { health, error };
  if (health) return { health };
  if (error) return { error };
  return {};
}
