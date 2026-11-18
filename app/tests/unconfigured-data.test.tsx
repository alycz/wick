import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedProvider, useFeed } from "@/hooks/use-feed";
import { useHealth, useMarketHistory, useMarkets } from "@/hooks/use-markets";
import { backendConfigured, getClaims, getFeed, getHealth, getHistory, getLpHistory, getMarkets, getPositions } from "@/lib/api";

describe("unconfigured production data sources", () => {
  const fetchMock = vi.fn();
  const eventSourceMock = vi.fn();
  const webSocketMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", eventSourceMock);
    vi.stubGlobal("WebSocket", webSocketMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("fails closed instead of returning simulated API responses", async () => {
    expect(backendConfigured()).toBe(false);

    await expect(getMarkets()).rejects.toThrow("Backend is not configured");
    await expect(getHistory("BTC-1D-100000")).rejects.toThrow("Backend is not configured");
    await expect(getFeed()).rejects.toThrow("Backend is not configured");
    await expect(getHealth()).rejects.toThrow("Backend is not configured");
    await expect(getLpHistory()).rejects.toThrow("Backend is not configured");
    await expect(getPositions("owner")).rejects.toThrow("Backend is not configured");
    await expect(getClaims("owner")).rejects.toThrow("Backend is not configured");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps markets, history, and health empty with explicit errors", async () => {
    const markets = renderHook(() => useMarkets());
    const history = renderHook(() => useMarketHistory("BTC-1D-100000"));
    const health = renderHook(() => useHealth());

    await waitFor(() => expect(markets.result.current.loading).toBe(false));
    expect(markets.result.current.markets).toEqual([]);
    expect(markets.result.current.error).toMatch(/Backend is not configured/);
    expect(history.result.current.history).toEqual([]);
    expect(history.result.current.error).toMatch(/Backend is not configured/);
    expect(health.result.current.health).toBeUndefined();
    expect(health.result.current.error).toMatch(/Backend health unavailable/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(webSocketMock).not.toHaveBeenCalled();
  });

  it("keeps the event feed disconnected and empty", () => {
    const wrapper = ({ children }: { children: ReactNode }) => <FeedProvider>{children}</FeedProvider>;
    const feed = renderHook(() => useFeed(), { wrapper });

    expect(feed.result.current.events).toEqual([]);
    expect(feed.result.current.connected).toBe(false);
    expect(feed.result.current.loading).toBe(false);
    expect(feed.result.current.error).toMatch(/Backend is not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(eventSourceMock).not.toHaveBeenCalled();
  });
});
