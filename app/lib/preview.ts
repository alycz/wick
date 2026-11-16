import { openPositionMath } from "@wick/pricing";
import type { MarketHistoryPoint, PositionSide, PricerMarket } from "@wick/shared";

export interface TradePreview {
  entry: number;
  contracts: number;
  maxPayout: number;
  feeAtMaxProfit: number;
  liqMark: number;
  liquidationPrice?: number;
  liquidationPct?: number;
}

export function tradePreview(market: PricerMarket, side: PositionSide, margin: number, leverage: number, history: MarketHistoryPoint[]): TradePreview {
  const math = openPositionMath({
    side,
    marginE6: BigInt(Math.round(Math.max(0, margin) * 1_000_000)),
    leverage,
    markYesE6: Math.round(market.theo * 1_000_000),
    halfSpreadE6: 5_000,
  });
  const result: TradePreview = {
    entry: math.entryE6 / 1_000_000,
    contracts: Number(math.contractsE6) / 1_000_000,
    maxPayout: Number(math.maxPayoutE6) / 1_000_000,
    feeAtMaxProfit: Number(math.maxPayoutE6) / 1_000_000 * 0.02,
    liqMark: math.liqMarkE6 / 1_000_000,
  };
  const distinct = [...history].reverse().find((point) => point.spot !== market.spot && point.theo !== market.theo);
  if (!distinct) return result;
  const yesSlope = (market.theo - distinct.theo) / (market.spot - distinct.spot);
  const slope = side === "yes" ? yesSlope : -yesSlope;
  const current = side === "yes" ? market.theo : 1 - market.theo;
  if (!Number.isFinite(slope) || Math.abs(slope) < 1e-9) return result;
  const price = market.spot + (result.liqMark - current) / slope;
  if (Number.isFinite(price) && price > 0) {
    result.liquidationPrice = price;
    result.liquidationPct = (price / market.spot - 1) * 100;
  }
  return result;
}
