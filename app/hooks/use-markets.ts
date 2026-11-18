"use client";

import { marketsResponseSchema, type MarketHistoryPoint, type PricerMarket } from "@wick/shared";
import { useEffect, useMemo, useState } from "react";
import { backendConfigured, marketDataConfigured, backendUrl, getHealth, getHistory, getMarkets, type HealthView } from "@/lib/api";

export function useMarkets(): { markets: PricerMarket[]; observedAt?: number; loading: boolean; error?: string } {
  const [snapshot, setSnapshot] = useState<{ markets: PricerMarket[]; observedAt?: number }>({ markets: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let receivedSnapshot = false;
    if (!marketDataConfigured()) {
      setError("Backend is not configured. Set NEXT_PUBLIC_BACKEND_URL to load live markets.");
      setLoading(false);
      return () => controller.abort();
    }
    void getMarkets(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted && !receivedSnapshot) { setSnapshot({ markets: value }); setError(undefined); }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && !receivedSnapshot) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const reconnect = () => {
      if (controller.signal.aborted) return;
      setError("Live market stream disconnected; showing the last verified snapshot.");
      retry = setTimeout(connect, 2_000);
    };
    function connect() {
      try {
        const streamUrl = new URL(backendUrl("/stream", true));
        streamUrl.protocol = streamUrl.protocol === "https:" ? "wss:" : "ws:";
        const connection = new WebSocket(streamUrl);
        socket = connection;
        connection.addEventListener("message", (message) => {
          if (controller.signal.aborted) return;
          try {
            const envelope = JSON.parse(String(message.data)) as { type?: unknown; data?: unknown; ts?: unknown };
            if (envelope.type === "markets") {
              const markets = marketsResponseSchema.parse(envelope.data) as unknown as PricerMarket[];
              const observedAt = typeof envelope.ts === "number" && Number.isFinite(envelope.ts) ? envelope.ts : undefined;
              setSnapshot({ markets, ...(observedAt === undefined ? {} : { observedAt }) });
              receivedSnapshot = true;
              setLoading(false);
              setError(undefined);
            }
          } catch { /* Keep the last validated snapshot. */ }
        });
        connection.addEventListener("close", reconnect);
        connection.addEventListener("error", () => connection.close());
      } catch { reconnect(); }
    }
    connect();
    return () => {
      controller.abort();
      clearTimeout(retry);
      socket?.close();
    };
  }, []);

  return error === undefined ? { ...snapshot, loading } : { ...snapshot, loading, error };
}

export function useMarket(symbol: string) {
  const state = useMarkets();
  return { ...state, market: useMemo(() => state.markets.find((item) => item.symbol === symbol), [state.markets, symbol]) };
}

const EMPTY_HISTORY: MarketHistoryPoint[] = [];

export function useMarketHistory(symbol: string): { history: MarketHistoryPoint[]; loading: boolean; error?: string } {
  const configured = marketDataConfigured();
  const [result, setResult] = useState<{ symbol: string; history: MarketHistoryPoint[]; error?: string }>();
  useEffect(() => {
    if (!symbol || !configured) return;
    const controller = new AbortController();
    void getHistory(symbol, controller.signal)
      .then((history) => {
        if (!controller.signal.aborted) setResult({ symbol, history });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setResult({ symbol, history: EMPTY_HISTORY, error: reason instanceof Error ? reason.message : String(reason) });
      });
    return () => controller.abort();
  }, [symbol, configured]);
  if (!symbol) return { history: EMPTY_HISTORY, loading: false };
  if (!configured) return { history: EMPTY_HISTORY, loading: false, error: "Backend is not configured." };
  if (result?.symbol !== symbol) return { history: EMPTY_HISTORY, loading: true };
  const { history, error } = result;
  return error === undefined ? { history, loading: false } : { history, loading: false, error };
}

export function useHealth(source: "market" | "account" = "market"): { health?: HealthView; error?: string } {
  const [health, setHealth] = useState<HealthView>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!(source === "market" ? marketDataConfigured() : backendConfigured())) {
      setError("Backend health unavailable until NEXT_PUBLIC_BACKEND_URL is configured.");
      return;
    }
    const controller = new AbortController();
    const refresh = () => void getHealth(controller.signal, source === "market")
      .then((value) => { setHealth(value); setError(undefined); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [source]);
  if (health && error) return { health, error };
  if (health) return { health };
  if (error) return { error };
  return {};
}
