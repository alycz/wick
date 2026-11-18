import { gunzipSync } from "node:zlib";
import type { VolPoint } from "@wick/vol";

export const MAX_CHAIN_AGE_MS = 120_000;

export interface Chain {
  captured_at: Date;
  spot: number;
  payload: Buffer;
}

export function decodeChain(chain: Chain): VolPoint[] {
  const snapshot = JSON.parse(gunzipSync(chain.payload).toString("utf8")) as { columns: string[]; quotes: unknown[][] };
  const names = ["expiryMs", "strike", "markIvPct", "underlyingPrice"];
  const indices = names.map((name) => snapshot.columns.indexOf(name));
  if (indices.some((index) => index === -1)) throw new Error("Unrecognized Deribit chain format");
  const ts = chain.captured_at.getTime();
  const points: VolPoint[] = [];
  for (const row of snapshot.quotes) {
    const [expiryMs, strike, iv, forward] = indices.map((index) => row[index]);
    if (typeof expiryMs !== "number" || typeof strike !== "number" || typeof iv !== "number") continue;
    points.push({ expiryMs, strike, vol: iv / 100, forward: typeof forward === "number" ? forward : chain.spot, ts });
  }
  return points;
}
