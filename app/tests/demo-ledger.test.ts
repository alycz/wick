import type { PricerMarket } from "@wick/shared";
import { describe, expect, it } from "vitest";
import { DemoClient } from "@/lib/demo/client";
import {
  claimQueue, claimRewards, closePosition, createLedger, DEMO_START_USDC_E6, deposit, openPosition, parseLedger,
  pendingRewardsE6, reconcile, seedHistory, settlePosition, stake, unstake, usdcE6, withdraw, type DemoLedger,
} from "@/lib/demo/ledger";

const NOW = 1_800_000_000_000;
const market = (overrides: Partial<PricerMarket> = {}): PricerMarket => ({
  symbol: "BTC-95000", eventTicker: "BTC", kind: "ladder", duration: "1d", title: "Bitcoin above $95,000", strike: 95_000,
  openTs: NOW - 3_600_000, expiryTs: NOW + 3_600_000, spot: 95_400, theo: 0.6, gemini: { ts: NOW }, maxLeverage: 10, status: "open", volSource: "deribit",
  ...overrides,
});
const fresh = (): DemoLedger => createLedger("DemoOwner1111111111111111111111111111111111", NOW);
const open = (ledger: DemoLedger, overrides: Partial<Parameters<typeof openPosition>[2]> = {}) =>
  openPosition(ledger, market(), { side: "yes", marginE6: usdcE6(100), leverage: 2, maxEntryE6: 990_000, ...overrides }, NOW);

describe("demo ledger", () => {
  it("starts with $10,000 and survives a JSON round trip", () => {
    const ledger = fresh();
    expect(BigInt(ledger.usdcE6)).toBe(DEMO_START_USDC_E6);
    expect(parseLedger(JSON.stringify(ledger))).toEqual(ledger);
    expect(parseLedger("{bad")).toBeUndefined();
  });

  it("opens a position with the program's math and takes the margin", () => {
    const { ledger, position, signature } = open(fresh());
    expect(signature).toHaveLength(88);
    expect(position.entryE6).toBe(605_000);
    expect(position.contractsE6).toBe(String(100_000_000n * 2n * 1_000_000n / 605_000n));
    expect(position.liqMarkE6).toBe(302_500);
    expect(BigInt(ledger.usdcE6)).toBe(DEMO_START_USDC_E6 - usdcE6(100));
  });

  it("rejects trades it can't afford or above the leverage cap", () => {
    expect(() => open(fresh(), { marginE6: usdcE6(20_000) })).toThrow(/Not enough USDC/);
    expect(() => open(fresh(), { leverage: 11 })).toThrow(/capped at 10x/);
    expect(() => open(fresh(), { maxEntryE6: 600_000 })).toThrow(/slippage/);
  });

  it("closes at the bid, charges 2% of profit and pays the rest", () => {
    const opened = open(fresh());
    const closed = closePosition(opened.ledger, opened.position.address, market({ theo: 0.7 }), 0, NOW + 1000);
    const position = closed.ledger.positions[0]!;
    expect(position.status).toBe("closed");
    const contracts = BigInt(opened.position.contractsE6);
    const pnl = contracts * BigInt(695_000 - 605_000) / 1_000_000n;
    const owed = usdcE6(100) + pnl - pnl * 200n / 10_000n;
    expect(BigInt(position.paidE6!)).toBe(owed);
    expect(BigInt(closed.ledger.usdcE6)).toBe(DEMO_START_USDC_E6 - usdcE6(100) + owed);
  });

  it("liquidates when the live mark crosses the liquidation level and pays $WICKED for the loss", () => {
    const opened = open(fresh());
    const next = reconcile(opened.ledger, [market({ theo: 0.3 })], NOW + 1000);
    expect(next.positions[0]!.status).toBe("liquidated");
    expect(next.positions[0]!.realizedPnlE6).toBe(String(-usdcE6(100)));
    expect(BigInt(next.wickedE6)).toBe(BigInt(opened.ledger.wickedE6) + usdcE6(100) * 10n);
    expect(reconcile(next, [market({ theo: 0.3 })], NOW + 2000)).toBe(next);
  });

  it("settles expired positions against spot, YES above the strike", () => {
    const opened = open(fresh(), { leverage: 1 });
    expect(() => settlePosition(opened.ledger, opened.position.address, 96_000, NOW)).toThrow(/hasn't expired/);
    const won = reconcile(opened.ledger, [market({ spot: 96_000 })], NOW + 3_600_000);
    expect(won.positions[0]!.status).toBe("settled");
    expect(BigInt(won.positions[0]!.realizedPnlE6!)).toBeGreaterThan(0n);
    const lost = settlePosition(opened.ledger, opened.position.address, 94_000, NOW + 3_600_000).ledger;
    expect(lost.positions[0]!.paidE6).toBe("0");
  });

  it("stakes, accrues rewards and claims them as USDC", () => {
    const staked = stake(fresh(), usdcE6(1000), NOW).ledger;
    expect(() => unstake(staked, usdcE6(2000), NOW)).toThrow(/more than you have staked/);
    const day = NOW + 86_400_000;
    expect(Number(pendingRewardsE6(staked, day))).toBeCloseTo(400_000, -2);
    const claimed = claimRewards(staked, day).ledger;
    expect(claimed.rewardsE6).toBe("0");
    expect(BigInt(claimed.usdcE6)).toBeGreaterThan(DEMO_START_USDC_E6);
  });

  it("moves money in and out with the same checks as a transfer", () => {
    const funded = deposit(fresh(), usdcE6(500), NOW).ledger;
    expect(BigInt(funded.usdcE6)).toBe(DEMO_START_USDC_E6 + usdcE6(500));
    expect(() => withdraw(funded, usdcE6(10), "not an address", NOW)).toThrow(/valid Solana address/);
    expect(() => withdraw(funded, usdcE6(20_000), "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin", NOW)).toThrow(/more than your balance/);
    const sent = withdraw(funded, usdcE6(10), "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin", NOW).ledger;
    expect(BigInt(sent.usdcE6)).toBe(DEMO_START_USDC_E6 + usdcE6(490));
    expect(sent.activity[0]!.kind).toBe("withdraw");
  });

  it("seeds a believable history once, including a queued payout to claim", () => {
    const seeded = seedHistory(fresh(), 95_000, NOW);
    expect(seeded.positions.map((position) => position.status).sort()).toEqual(["closed", "closed", "liquidated", "settled"]);
    expect(seedHistory(seeded, 95_000, NOW)).toBe(seeded);
    const claim = seeded.claims[0]!;
    const paid = claimQueue(seeded, claim.address, NOW).ledger;
    expect(paid.claims[0]!.status).toBe("paid");
    expect(BigInt(paid.usdcE6) - BigInt(seeded.usdcE6)).toBe(BigInt(claim.amountE6) - BigInt(claim.paidE6));
  });
});

describe("DemoClient", () => {
  it("acts like the chain client against the stored ledger", async () => {
    let ledger = fresh();
    const client = new DemoClient({ read: () => ledger, write: (next) => { ledger = next; }, markets: () => [market()] }, 0, () => NOW);
    const signature = await client.openPosition({ symbol: "BTC-95000", side: "no", marginE6: usdcE6(50), leverage: 3, maxEntryE6: 990_000 });
    expect(signature).toHaveLength(88);
    expect(ledger.positions[0]!.side).toBe("no");
    await expect(client.openPosition({ symbol: "MISSING", side: "yes", marginE6: 1n, leverage: 1, maxEntryE6: 990_000 })).rejects.toThrow(/isn't available/);
    await client.closePosition({ address: ledger.positions[0]!.address, market: "BTC-95000", owner: ledger.owner }, 10_000);
    expect(ledger.positions[0]!.status).toBe("closed");
  });
});
