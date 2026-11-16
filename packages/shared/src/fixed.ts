import { MICRO } from "./constants.js";

export function mulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("division by zero");
  return (a * b) / denominator;
}

export function usdcToE6(value: number): bigint {
  if (!Number.isFinite(value) || value < 0) throw new RangeError("invalid USDC value");
  return BigInt(Math.round(value * Number(MICRO)));
}

export function e6ToUsdc(value: bigint): number {
  return Number(value) / Number(MICRO);
}

export function probabilityToE6(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("invalid probability");
  return Math.round(value * 1_000_000);
}
