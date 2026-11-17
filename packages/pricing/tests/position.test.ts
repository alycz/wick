import { describe, expect, it } from "vitest";
import {
  checkLiabilityLimits,
  closeResult,
  contractsE6,
  liquidationMarkE6,
  openPositionMath,
  pnlE6,
  sideMarkE6,
} from "../src/index.js";

describe("fixed-point position math", () => {
  it("opens YES and NO positions using the specified side mark and spread", () => {
    const yes = openPositionMath({ side: "yes", marginE6: 100_000_000n, leverage: 4, markYesE6: 600_000, halfSpreadE6: 5_000 });
    const no = openPositionMath({ side: "no", marginE6: 100_000_000n, leverage: 4, markYesE6: 600_000, halfSpreadE6: 5_000 });
    expect(yes.sideMarkE6).toBe(600_000);
    expect(yes.entryE6).toBe(605_000);
    expect(no.sideMarkE6).toBe(400_000);
    expect(no.entryE6).toBe(405_000);
    expect(yes.contractsE6).toBe(100_000_000n * 4n * 1_000_000n / 605_000n);
  });

  it("matches PnL, liquidation and fee arithmetic exactly", () => {
    const quantity = contractsE6(10_000_000n, 10, 500_000);
    expect(quantity).toBe(200_000_000n);
    expect(pnlE6(quantity, 550_000, 500_000)).toBe(10_000_000n);
    expect(liquidationMarkE6(500_000, 10)).toBe(450_000);
    expect(liquidationMarkE6(500_000, 10, 500)).toBe(452_500);
    expect(liquidationMarkE6(500_000, 6)).toBe(416_666);
    expect(closeResult(10_000_000n, quantity, 500_000, 550_000, 200)).toEqual({
      pnlE6: 10_000_000n,
      feeE6: 200_000n,
      owedE6: 19_800_000n,
      lossE6: 0n,
    });
  });

  it("enforces both pool liability caps with the required readable error", () => {
    const base = {
      marketNetLiabilityE6: 0n,
      vaultFreeE6: 100_000_000n,
      liabilityAllowanceE6: 0n,
      maxPayoutBpsOfVault: 2_000,
      maxMarketExposureBps: 5_000,
    };
    expect(checkLiabilityLimits({ ...base, maxPayoutE6: 20_000_000n })).toEqual({ ok: true });
    expect(checkLiabilityLimits({ ...base, maxPayoutE6: 20_000_001n })).toEqual({
      ok: false,
      reason: "Pool too small for this size — lower leverage or margin",
    });
    expect(checkLiabilityLimits({ ...base, maxPayoutE6: 20_000_000n, marketNetLiabilityE6: 30_000_001n }).ok).toBe(false);
  });

  it("matches independent integer formulas for 1,000 deterministic positions", () => {
    let state = 0x51a7f00d;
    const random = (): number => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    };
    for (let index = 0; index < 1_000; index += 1) {
      const side = random() < 0.5 ? "yes" : "no";
      const markYes = 10_000 + Math.floor(random() * 980_001);
      const margin = BigInt(1 + Math.floor(random() * 1_000_000_000));
      const leverage = 1 + Math.floor(random() * 1_000);
      const spread = Math.min(5_000, 1_000_000 - sideMarkE6(side, markYes));
      const result = openPositionMath({ side, marginE6: margin, leverage, markYesE6: markYes, halfSpreadE6: spread });
      const expectedEntry = (side === "yes" ? markYes : 1_000_000 - markYes) + spread;
      const expectedQuantity = margin * BigInt(leverage) * 1_000_000n / BigInt(expectedEntry);
      const expectedLiq = BigInt(expectedEntry) * BigInt(leverage - 1) / BigInt(leverage);
      expect(result.entryE6).toBe(expectedEntry);
      expect(result.contractsE6).toBe(expectedQuantity);
      expect(result.liqMarkE6).toBe(Number(expectedLiq));
    }
  });
});
