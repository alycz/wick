import type { GeminiContract, GeminiEvent } from "./schemas.js";

export type GeminiMarketBucket =
  | "five_minute"
  | "fifteen_minute"
  | "hourly"
  | "daily"
  | "weekly"
  | "month_end"
  | "unsupported";

export interface DiscoveredEvent {
  bucket: Exclude<GeminiMarketBucket, "unsupported">;
  event: GeminiEvent;
  contracts: GeminiContract[];
}

function tagNames(event: GeminiEvent): Set<string> {
  return new Set(event.eventTags.map((tag) => tag.name.toLowerCase()));
}

export function classifyEvent(event: GeminiEvent, nowMs = Date.now()): GeminiMarketBucket {
  const tags = tagNames(event);
  if (event.type === "binary" && (tags.has("up down") || event.contracts.some((contract) => contract.ticker === "UP"))) {
    if (event.series === "BTC05M" || tags.has("five minute")) return "five_minute";
    if (event.series === "BTC15M" || tags.has("fifteen minute")) return "fifteen_minute";
    return "unsupported";
  }
  if (event.type !== "categorical") return "unsupported";

  const title = event.title.toLowerCase();
  const remainingMs = Math.max(0, Date.parse(event.expiryDate) - nowMs);
  const hours = remainingMs / 3_600_000;
  if (event.series === "BTC" || title.includes("month") || hours > 24 * 10) return "month_end";
  if (/today at/.test(title) && hours <= 4) return "hourly";
  if (hours <= 36) return "daily";
  if (hours <= 24 * 10) return "weekly";
  return "month_end";
}

function relevantContracts(event: GeminiEvent): GeminiContract[] {
  return event.contracts.filter((contract) => {
    if (contract.status !== "active" || contract.marketState === "closed") return false;
    if (event.type === "binary") return contract.ticker === "UP";
    if (contract.strike.type !== "above" || contract.strike.value == null) return false;
    const strike = Number(contract.strike.value);
    return Number.isFinite(strike) && strike > 0;
  });
}

function chooseCurrentAndNext(events: GeminiEvent[], bucket: "five_minute" | "fifteen_minute", nowMs: number): GeminiEvent[] {
  return events
    .filter((event) => classifyEvent(event, nowMs) === bucket && Date.parse(event.expiryDate) > nowMs)
    .sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime))
    .slice(0, 2);
}

export function discoverBtcMarkets(events: GeminiEvent[], spot: number, nowMs = Date.now()): DiscoveredEvent[] {
  if (!Number.isFinite(spot) || spot <= 0) throw new RangeError("spot must be positive");
  const btc = events.filter((event) => event.ticker.startsWith("BTC") && event.status === "active");
  const selected: GeminiEvent[] = [
    ...chooseCurrentAndNext(btc, "fifteen_minute", nowMs),
    ...chooseCurrentAndNext(btc, "five_minute", nowMs),
    ...btc.filter((event) => event.type === "categorical" && Date.parse(event.expiryDate) > nowMs),
  ];
  const seen = new Set<string>();
  return selected.flatMap((event): DiscoveredEvent[] => {
    if (seen.has(event.ticker)) return [];
    seen.add(event.ticker);
    const bucket = classifyEvent(event, nowMs);
    if (bucket === "unsupported") return [];
    const contracts = relevantContracts(event);
    return contracts.length > 0 ? [{ bucket, event, contracts }] : [];
  });
}
