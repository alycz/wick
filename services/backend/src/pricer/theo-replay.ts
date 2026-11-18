import { ladderTheo, upDownTheo } from "@wick/pricing";
import type { MarketHistoryPoint, PricerMarket } from "@wick/shared";

export type TheoModelInput =
  | { model: "up_down_v1"; twapWindowSeconds: number }
  | { model: "ladder_v1"; halfWidthFraction: number; lowerVolatility: number; upperVolatility: number };

export type MarketTheoInput = Pick<PricerMarket, "symbol" | "duration" | "expiryTs" | "spot" | "strike" | "theo" | "volSource">
  & Pick<MarketHistoryPoint, "geminiMid" | "geminiBid" | "geminiAsk">
  & { timeYears: number; volatility: number }
  & TheoModelInput;

export function replayTheo(input: MarketTheoInput): number {
  if (input.model === "up_down_v1") {
    return upDownTheo({
      spot: input.spot, strike: input.strike, volatility: input.volatility,
      timeYears: input.timeYears, twapWindowSeconds: input.twapWindowSeconds,
    }).probability;
  }
  return ladderTheo({
    forward: input.spot, strike: input.strike, timeYears: input.timeYears, halfWidthFraction: input.halfWidthFraction,
    volAtStrike: (strike) => strike < input.strike ? input.lowerVolatility : input.upperVolatility,
  });
}
