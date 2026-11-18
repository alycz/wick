import type { PricerMarket } from "@wick/shared";
import { describe, expect, it } from "vitest";
import { DemoClient } from "@/lib/demo/client";
import {
  claimRewards, closePosition, createLedger, demoAccountId, demoReceiptId, DEMO_START_USDC_E6, deposit, openPosition, parseLedger,
  pendingRewardsE6, reconcile, settlePosition, stake, unstake, usdcE6, withdraw, type DemoLedger,
} from "@/lib/demo/ledger";

const NOW = 1_800_000_000_000;
const market = (overrides: Partial<PricerMarket> = {}): PricerMarket => ({
  symbol: "BTC-95000", eventTicker: "BTC", kind: "ladder", duration: "1d", title: "Bitcoin above $95,000", strike: 95_000,
  openTs: NOW - 3_600_000, expiryTs: NOW + 3_600_000, spot: 95_400, theo: 0.6, gemini: { ts: NOW }, maxLeverage: 10, status: "open", volSource: "deribit",
  ...overrides,
});
const fresh = (): DemoLedger => createLedger(demoAccountId(() => 0.5, NOW), NOW);
const open = (ledger: DemoLedger, overrides: Partial<Parameters<typeof openPosition>[2]> = {}) =>
  openPosition(ledger, market(), { side: "yes", marginE6: usdcE6(100), leverage: 2, maxEntryE6: 990_000, ...overrides }, NOW);

describe("demo ledger", () => {
  it("starts new users with a clean local-only account and rejects unknown ledger versions", () => {
    const ledger = fresh();
    expect(BigInt(ledger.usdcE6)).toBe(DEMO_START_USDC_E6);
    expect(ledger.owner).toMatch(/^demo-account-/);
    expect(ledger.wickedE6).toBe("0");
    expect(ledger.positions).toEqual([]);
    expect(ledger.claims).toEqual([]);
    expect(ledger.activity).toEqual([]);
    expect(parseLedger(JSON.stringify(ledger))).toEqual(ledger);
    expect(parseLedger(JSON.stringify({ ...ledger, version: 3 }))).toBeUndefined();
    expect(parseLedger("{bad")).toBeUndefined();
  });

  it("migrates version-1 records without loss while marking them local and unverified", () => {
    const owner = "DemoOwner1111111111111111111111111111111111";
    const legacyPosition = {
      address: "LegacyPosition1111111111111111111111111111111", owner, market: "BTC-DEMO-95000", side: "yes", marginE6: "250000000",
      leverage: 3, entryE6: 580000, contractsE6: "1293103448", liqMarkE6: 290000, status: "settled", realizedPnlE6: "10000000",
      paidE6: "260000000", openedTs: NOW - 7200, closedTs: NOW - 3600,
      snapshot: { symbol: "BTC-DEMO-95000", kind: "ladder", duration: "1d", title: "Legacy example", strike: 95000, expiryTs: NOW - 3600 },
    };
    const legacy = {
      version: 1, owner, createdTs: NOW - 10_000, usdcE6: "9876000000", wickedE6: "1250000000", stakedE6: "500000000",
      rewardsE6: "400000", rewardsTs: NOW - 5000, nextClaimIndex: 2, seeded: true,
      positions: [legacyPosition],
      claims: [{ address: "LegacyClaim111111111111111111111111111111111", claimIndex: "1", owner, amountE6: "64180000", paidE6: "21400000", status: "queued" }],
      activity: [{ signature: "4".repeat(88), ts: NOW - 3600, kind: "settle", amountE6: "260000000", detail: "BTC-DEMO-95000" }],
    };
    const migrated = parseLedger(JSON.stringify(legacy), NOW)!;

    expect(migrated.version).toBe(2);
    expect(migrated.usdcE6).toBe(legacy.usdcE6);
    expect(migrated.wickedE6).toBe(legacy.wickedE6);
    expect(migrated.stakedE6).toBe(legacy.stakedE6);
    expect(migrated.positions).toHaveLength(1);
    expect(migrated.positions[0]).toMatchObject({ market: legacyPosition.market, paidE6: legacyPosition.paidE6, legacyUnverified: true });
    expect(migrated.positions[0]!.address).toMatch(/^demo-position-legacy-/);
    expect(migrated.claims[0]).toMatchObject({ amountE6: "64180000", legacyUnverified: true });
    expect(migrated.claims[0]!.address).toMatch(/^demo-claim-legacy-/);
    expect(migrated.activity[0]).toMatchObject({ kind: "settle", amountE6: "260000000", legacyUnverified: true });
    expect(migrated.activity[0]!.receiptId).toMatch(/^demo-receipt-legacy-/);
    expect(migrated.activity[0]!.receiptId).not.toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);
    expect(migrated.rewardsE6).toBe("0");
    expect(migrated.legacyMigration).toEqual({ sourceVersion: 1, migratedTs: NOW, seededExamples: true, legacySyntheticRewardsE6: "400000" });
    expect(parseLedger(JSON.stringify(migrated), NOW + 1)).toEqual(migrated);
  });

  it("uses unmistakably local receipts rather than Solana-shaped signatures", () => {
    const receipt = demoReceiptId(() => 0.5, NOW);
    expect(receipt).toMatch(/^demo-receipt-/);
    expect(receipt).not.toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);
  });

  it("opens a position with the program's math and takes the margin", () => {
    const { ledger, position, receiptId } = open(fresh());
    expect(receiptId).toMatch(/^demo-receipt-/);
    expect(position.address).toMatch(/^demo-position-/);
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

  it("leaves expired positions pending until Gemini's official outcome is supplied", () => {
    const opened = open(fresh(), { leverage: 1 });
    expect(() => settlePosition(opened.ledger, opened.position.address, "yes", NOW)).toThrow(/hasn't expired/);
    const pending = reconcile(opened.ledger, [market({ spot: 96_000 })], NOW + 3_600_000);
    expect(pending.positions[0]!.status).toBe("open");
    expect(() => settlePosition(pending, opened.position.address, undefined, NOW + 3_600_000)).toThrow(/Gemini's official outcome/);
    const won = settlePosition(pending, opened.position.address, "yes", NOW + 3_600_000).ledger;
    expect(won.positions[0]!.status).toBe("settled");
    expect(BigInt(won.positions[0]!.realizedPnlE6!)).toBeGreaterThan(0n);
    const second = open(fresh(), { leverage: 1 });
    const lost = settlePosition(second.ledger, second.position.address, "no", NOW + 3_600_000).ledger;
    expect(lost.positions[0]!.paidE6).toBe("0");
  });

  it("does not fabricate time-based staking rewards", () => {
    const funded = { ...fresh(), wickedE6: usdcE6(1000).toString() };
    const staked = stake(funded, usdcE6(1000), NOW).ledger;
    expect(() => unstake(staked, usdcE6(2000), NOW)).toThrow(/more than you have staked/);
    const day = NOW + 86_400_000;
    expect(pendingRewardsE6(staked)).toBe(0n);
    expect(() => claimRewards({ ...staked, rewardsE6: "400000" }, day)).toThrow(/does not calculate or pay staking rewards/);
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

});

describe("DemoClient", () => {
  it("acts like the chain client against the stored ledger", async () => {
    let ledger = fresh();
    const client = new DemoClient({ read: () => ledger, write: (next) => { ledger = next; }, markets: () => [market()] }, 0, () => NOW);
    const receiptId = await client.openPosition({ symbol: "BTC-95000", side: "no", marginE6: usdcE6(50), leverage: 3, maxEntryE6: 990_000 });
    expect(receiptId).toMatch(/^demo-receipt-/);
    expect(ledger.positions[0]!.side).toBe("no");
    await expect(client.openPosition({ symbol: "MISSING", side: "yes", marginE6: 1n, leverage: 1, maxEntryE6: 990_000 })).rejects.toThrow(/isn't available/);
    await client.closePosition({ address: ledger.positions[0]!.address, market: "BTC-95000", owner: ledger.owner }, 10_000);
    expect(ledger.positions[0]!.status).toBe("closed");
  });
});
