"use client";

import type { IndexedEvent } from "@wick/shared";
import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import { backendConfigured, backendUrl, liveBackend, getFeed, parseIndexedEvent } from "@/lib/api";
import { mergeIndexedEvents } from "@/lib/feed";

export interface FeedState { events: IndexedEvent[]; connected: boolean; loading: boolean; error?: string }

const FeedContext = createContext<FeedState | undefined>(undefined);

function useFeedSource(): FeedState {
  const configured = backendConfigured();
  const [events, setEvents] = useState<IndexedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | undefined>(configured ? undefined : "Backend is not configured. Indexer events cannot be verified.");
  useEffect(() => {
    const controller = new AbortController();
    let source: EventSource | undefined;
    let refreshInFlight: Promise<void> | undefined;
    if (!configured) return () => controller.abort();
    const refresh = (): Promise<void> => {
      if (refreshInFlight) return refreshInFlight;
      setLoading(true);
      refreshInFlight = getFeed(controller.signal)
        .then((snapshot) => {
          if (!controller.signal.aborted) {
            setEvents((current) => mergeIndexedEvents(current, snapshot));
            setError(undefined);
          }
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
          refreshInFlight = undefined;
        });
      return refreshInFlight;
    };
    let timer: number | undefined;
    const openSource = () => {
      if (controller.signal.aborted) return;
      if (!liveBackend()) {
        setConnected(true);
        timer = window.setInterval(() => void refresh(), 15_000);
        return;
      }
      source = new EventSource(backendUrl("/events/stream"));
      source.addEventListener("open", () => { setConnected(true); void refresh(); });
      source.addEventListener("error", () => {
        setConnected(false);
        setError((current) => current ?? "Live indexer connection interrupted; reconnecting.");
      });
      source.addEventListener("wick", (message) => {
        try {
          const event = parseIndexedEvent(JSON.parse((message as MessageEvent<string>).data));
          setEvents((current) => mergeIndexedEvents(current, [event]));
        } catch { /* ignore malformed event frames */ }
      });
    };
    /* the first snapshot decides the source: the backend's event stream, or demo data if the backend is unreachable */
    void refresh().then(openSource);
    return () => { controller.abort(); source?.close(); if (timer !== undefined) window.clearInterval(timer); };
  }, [configured]);
  return { events, connected, loading, ...(error === undefined ? {} : { error }) };
}

export function FeedProvider({ children }: { children: ReactNode }) {
  return createElement(FeedContext.Provider, { value: useFeedSource() }, children);
}

export function useFeed(): FeedState {
  const context = useContext(FeedContext);
  if (!context) throw new Error("FeedProvider is missing");
  return context;
}
