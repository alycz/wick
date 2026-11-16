import { PRICE_MICRO } from "@wick/shared";

export type PricingSide = "yes" | "no";

export interface PositionMathInput {
  side: PricingSide;
  marginE6: bigint;
  leverage: number;
  markYesE6: number;
  halfSpreadE6?: number;
  maintenanceBps?: number;
}

export interface PositionMath {
  sideMarkE6: number;
  entryE6: number;
  contractsE6: bigint;
  liqMarkE6: number;
  maxPayoutE6: bigint;
}

function validatePrice(priceE6: number, label: string): void {
  if (!Number.isSafeInteger(priceE6) || priceE6 < 0 || priceE6 > PRICE_MICRO) {
    throw new RangeError(`${label} must be an integer probability in micro-units`);
  }
}

export function sideMarkE6(side: PricingSide, markYesE6: number): number {
  validatePrice(markYesE6, "markYesE6");
  return side === "yes" ? markYesE6 : PRICE_MICRO - markYesE6;
}

export function contractsE6(marginE6: bigint, leverage: number, entryE6: number): bigint {
  if (marginE6 < 0n) throw new RangeError("marginE6 must be non-negative");
  if (!Number.isSafeInteger(leverage) || leverage < 1 || leverage > 65_535) throw new RangeError("invalid leverage");
  validatePrice(entryE6, "entryE6");
  if (entryE6 === 0) throw new RangeError("entryE6 must be positive");
  return marginE6 * BigInt(leverage) * BigInt(PRICE_MICRO) / BigInt(entryE6);
}

export function pnlE6(quantityE6: bigint, markE6: number, entryE6: number): bigint {
  if (quantityE6 < 0n) throw new RangeError("quantityE6 must be non-negative");
  validatePrice(markE6, "markE6");
  validatePrice(entryE6, "entryE6");
  return quantityE6 * BigInt(markE6 - entryE6) / BigInt(PRICE_MICRO);
}

export function liquidationMarkE6(entryE6: number, leverage: number, maintenanceBps = 0): number {
  validatePrice(entryE6, "entryE6");
  if (!Number.isSafeInteger(leverage) || leverage < 1 || leverage > 65_535) throw new RangeError("invalid leverage");
  if (!Number.isSafeInteger(maintenanceBps) || maintenanceBps < 0 || maintenanceBps > 10_000) {
    throw new RangeError("maintenanceBps must be between 0 and 10000");
  }
  const numerator = BigInt(entryE6) * BigInt(leverage * 10_000 - (10_000 - maintenanceBps));
  return Number(numerator / BigInt(leverage * 10_000));
}

export function maxPayoutE6(quantityE6: bigint, entryE6: number): bigint {
  validatePrice(entryE6, "entryE6");
  return quantityE6 * BigInt(PRICE_MICRO - entryE6) / BigInt(PRICE_MICRO);
}

export function openPositionMath(input: PositionMathInput): PositionMath {
  const sideMark = sideMarkE6(input.side, input.markYesE6);
  const spread = input.halfSpreadE6 ?? 0;
  if (!Number.isSafeInteger(spread) || spread < 0) throw new RangeError("halfSpreadE6 must be non-negative");
  const entry = sideMark + spread;
  validatePrice(entry, "entryE6");
  const quantity = contractsE6(input.marginE6, input.leverage, entry);
  return {
    sideMarkE6: sideMark,
    entryE6: entry,
    contractsE6: quantity,
    liqMarkE6: liquidationMarkE6(entry, input.leverage, input.maintenanceBps ?? 0),
    maxPayoutE6: maxPayoutE6(quantity, entry),
  };
}

export interface CloseResult {
  pnlE6: bigint;
  feeE6: bigint;
  owedE6: bigint;
  lossE6: bigint;
}

export function closeResult(
  marginE6: bigint,
  quantityE6: bigint,
  entryE6: number,
  exitE6: number,
  profitFeeBps: number,
): CloseResult {
  if (!Number.isSafeInteger(profitFeeBps) || profitFeeBps < 0 || profitFeeBps > 10_000) {
    throw new RangeError("profitFeeBps must be between 0 and 10000");
  }
  const pnl = pnlE6(quantityE6, exitE6, entryE6);
  const fee = pnl > 0n ? pnl * BigInt(profitFeeBps) / 10_000n : 0n;
  const rawOwed = marginE6 + pnl - fee;
  const owed = rawOwed > 0n ? rawOwed : 0n;
  const loss = pnl < 0n ? -pnl > marginE6 ? marginE6 : -pnl : 0n;
  return { pnlE6: pnl, feeE6: fee, owedE6: owed, lossE6: loss };
}

export interface LiabilityLimitsInput {
  maxPayoutE6: bigint;
  marketNetLiabilityE6: bigint;
  vaultFreeE6: bigint;
  liabilityAllowanceE6: bigint;
  maxPayoutBpsOfVault: number;
  maxMarketExposureBps: number;
}

export function checkLiabilityLimits(input: LiabilityLimitsInput): { ok: true } | { ok: false; reason: string } {
  const base = input.vaultFreeE6 + input.liabilityAllowanceE6;
  const payoutLimit = base * BigInt(input.maxPayoutBpsOfVault) / 10_000n;
  if (input.maxPayoutE6 > payoutLimit) {
    return { ok: false, reason: "Pool too small for this size — lower leverage or margin" };
  }
  const exposureLimit = base * BigInt(input.maxMarketExposureBps) / 10_000n;
  if (input.marketNetLiabilityE6 + input.maxPayoutE6 > exposureLimit) {
    return { ok: false, reason: "Pool too small for this size — lower leverage or margin" };
  }
  return { ok: true };
}
