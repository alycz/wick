"use client";

import type { IndexedEvent } from "@wick/shared";
import { useEffect, useState } from "react";
import { backendConfigured, backendUrl, getFeed } from "@/lib/api";

export function useFeed(): { events: IndexedEvent[]; connected: boolean } {
  const [events, setEvents] = useState<IndexedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let source: EventSource | undefined;
    if (!backendConfigured()) return () => controller.abort();
    void getFeed(controller.signal).then(setEvents).catch(() => undefined);
    source = new EventSource(backendUrl("/events/stream"));
    source.addEventListener("open", () => setConnected(true));
    source.addEventListener("error", () => setConnected(false));
    source.addEventListener("wick", (message) => {
      try {
        const event = JSON.parse((message as MessageEvent<string>).data) as IndexedEvent;
        if (event.signature && event.name) setEvents((current) => [event, ...current].slice(0, 50));
      } catch { /* ignore malformed event frames */ }
    });
    return () => { controller.abort(); source?.close(); };
  }, []);
  return { events, connected };
}
