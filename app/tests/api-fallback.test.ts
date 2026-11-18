import { afterEach, describe, expect, it, vi } from "vitest";

async function loadApi(url: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", url);
  return import("@/lib/api");
}

describe("backend URL and fallback", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("adds https:// to a bare host and drops trailing slashes", async () => {
    const { normalizeBackendUrl } = await loadApi("");
    expect(normalizeBackendUrl("wick-backend.up.railway.app/")).toBe("https://wick-backend.up.railway.app");
    expect(normalizeBackendUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeBackendUrl("  ")).toBe("");
  });

  it("switches to demo data when the backend can't be reached", async () => {
    const api = await loadApi("wick-backend.railway.internal");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(api.liveBackend()).toBe(true);
    expect((await api.getMarkets()).length).toBeGreaterThan(10);
    expect(api.liveBackend()).toBe(false);
  });

  it("switches to demo data when the backend answers 404", async () => {
    const api = await loadApi("https://example.invalid");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found", { status: 404 })));
    expect((await api.getHealth()).ok).toBe(true);
    expect(api.liveBackend()).toBe(false);
  });
});
