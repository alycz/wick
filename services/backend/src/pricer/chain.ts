import type {
  ChainPort,
  CreateMarketRequest,
  MarkUpdateRequest,
  OpenPositionRef,
} from "./types.js";

/** Explicit unavailable state used until a real deployed-program adapter exists. */
export class UnconfiguredChainPort implements ChainPort {
  configured(): boolean { return false; }
  private unavailable(): never { throw new Error("Wick chain port is not configured"); }
  marketExists(_symbol: string, _signal?: AbortSignal): Promise<boolean> { return Promise.reject(this.unavailable()); }
  createMarket(_request: CreateMarketRequest, _signal?: AbortSignal): Promise<string> { return Promise.reject(this.unavailable()); }
  updateMarks(_requests: readonly MarkUpdateRequest[], _options: { priorityFeeMicroLamports: number; signal?: AbortSignal }): Promise<string> { return Promise.reject(this.unavailable()); }
  listOpenPositions(_signal?: AbortSignal): Promise<readonly OpenPositionRef[]> { return Promise.reject(this.unavailable()); }
  liquidate(_positionAddress: string, _signal?: AbortSignal): Promise<string> { return Promise.reject(this.unavailable()); }
  settleMarket(_symbol: string, _outcome: "yes" | "no", _settlementValueE6: bigint, _signal?: AbortSignal): Promise<string> { return Promise.reject(this.unavailable()); }
  voidMarket(_symbol: string, _signal?: AbortSignal): Promise<string> { return Promise.reject(this.unavailable()); }
  settleOpenPositions(_symbol: string, _signal?: AbortSignal): Promise<readonly string[]> { return Promise.reject(this.unavailable()); }
  claimQueue(_signal?: AbortSignal): Promise<readonly string[]> { return Promise.reject(this.unavailable()); }
}
