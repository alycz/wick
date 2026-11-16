import { describe, expect, it } from "vitest";
import { runBots, type BotTransport } from "../lib/bot-engine.js";

describe("runBots", () => {
  it("uses real transport results and keeps leverage within the market cap", async () => {
    let now = 1_000;
    const requests: Array<{ leverage: number; side: string; marginE6: bigint }> = [];
    const transport: BotTransport = {
      prepareWallet: async (index) => ({ id: `wallet-${index}` }),
      listMarkets: async () => [{ symbol: "BTC", status: "open", expiryTs: 10_000, maxLeverage: 4 }],
      openPosition: async (request) => { requests.push(request); return `signature-${requests.length}`; },
    };
    const values = [0.1, 0.2, 0.9, 0.5]; let cursor = 0;
    const result = await runBots(transport, {
      count: 2, durationMs: 2_000, intervalMs: 1_000, now: () => now,
      sleep: async (ms) => { now += ms; }, random: () => values[cursor++ % values.length] as number,
    });
    expect(result).toMatchObject({ attempted: 2, opened: 2, failed: 0 });
    expect(requests.every((request) => request.leverage >= 1 && request.leverage <= 4)).toBe(true);
    expect(requests.every((request) => request.marginE6 >= 5_000_000n && request.marginE6 <= 50_000_000n)).toBe(true);
  });

  it("fails closed when there is no live configured market", async () => {
    const transport: BotTransport = { prepareWallet: async () => ({ id: "wallet" }), listMarkets: async () => [], openPosition: async () => "never" };
    await expect(runBots(transport, { count: 1, durationMs: 1, intervalMs: 1 })).rejects.toThrow("No real configured devnet market");
  });
});
