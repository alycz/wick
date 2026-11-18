import { afterEach, describe, expect, it, vi } from "vitest";

async function loadApi(url: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", url);
  return import("@/lib/api");
}

describe("backend URL and failures", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("adds https:// to a bare host and drops trailing slashes", async () => {
    const { normalizeBackendUrl } = await loadApi("");
    expect(normalizeBackendUrl("wick-backend.up.railway.app/")).toBe("https://wick-backend.up.railway.app");
    expect(normalizeBackendUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeBackendUrl("  ")).toBe("");
  });

  it("routes marks and archives to the market feed while preserving account endpoints", async () => {
    vi.stubEnv("NEXT_PUBLIC_MARKET_DATA_URL", "https://quotes.example");
    const api = await loadApi("https://accounts.example");
    const fetcher = vi.fn().mockImplementation(async () => new Response("[]"));
    vi.stubGlobal("fetch", fetcher);
    await api.getMarkets();
    await api.getHistory("BTC");
    await api.getUpDownContracts();
    await api.getLadderContracts();
    await api.getPositions("owner");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://quotes.example/markets",
      "https://quotes.example/markets/BTC/history",
      "https://quotes.example/markets/up-down-history",
      "https://quotes.example/markets/ladder-history",
      "https://accounts.example/positions?owner=owner",
    ]);
    expect(api.backendUrl("/stream", true)).toBe("https://quotes.example/stream");
  });

  it("surfaces network failures instead of fabricating market data", async () => {
    const api = await loadApi("wick-backend.railway.internal");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(api.backendConfigured()).toBe(true);
    await expect(api.getMarkets()).rejects.toThrow("Failed to fetch");
  });

  it("surfaces HTTP failures instead of claiming healthy providers", async () => {
    const api = await loadApi("https://example.invalid");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found", { status: 404 })));
    await expect(api.getHealth()).rejects.toThrow("Backend request failed (404)");
  });
});
