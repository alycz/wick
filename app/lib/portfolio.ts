import { PublicKey } from "@solana/web3.js";
import { pnlE6, sideMarkE6 } from "@wick/pricing";
import type { PositionView, PricerMarket } from "@wick/shared";

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

export async function marketAddressForSymbol(symbol: string, programId: string): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", encode(symbol)));
  return PublicKey.findProgramAddressSync([encode("market"), digest], new PublicKey(programId))[0].toBase58();
}

export function livePositionPnlE6(position: PositionView, market: PricerMarket): bigint {
  const markYesE6 = Math.round(market.theo * 1_000_000);
  return pnlE6(BigInt(position.contractsE6), sideMarkE6(position.side, markYesE6), position.entryE6);
}

export async function calculateLivePositionPnls(
  positions: readonly PositionView[],
  markets: readonly PricerMarket[],
  programId: string,
): Promise<Map<string, bigint>> {
  const marketsByAddress = new Map<string, PricerMarket>();
  await Promise.all(markets.map(async (market) => {
    marketsByAddress.set(await marketAddressForSymbol(market.symbol, programId), market);
  }));
  const result = new Map<string, bigint>();
  for (const position of positions) {
    if (position.status !== "open") continue;
    const market = marketsByAddress.get(position.market);
    if (market) result.set(position.address, livePositionPnlE6(position, market));
  }
  return result;
}
