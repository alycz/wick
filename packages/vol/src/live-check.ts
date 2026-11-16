import { DeribitVolSource } from "./deribit.js";
import { DeriveVolSource } from "./derive.js";

const deribit = new DeribitVolSource({ websocket: false, timers: false, staleAfterMs: 30_000 });
const derive = new DeriveVolSource({ timers: false, staleAfterMs: 30_000, maxExpiries: 2 });
const results = await Promise.allSettled([deribit.start(), derive.start()]);
const report = {
  checkedAt: new Date().toISOString(),
  deribit: results[0]?.status === "fulfilled"
    ? { healthy: deribit.healthy(), spot: deribit.spot(), surface: deribit.surfaceStats() }
    : { healthy: false, error: results[0]?.reason instanceof Error ? results[0].reason.message : String(results[0]?.reason) },
  derive: results[1]?.status === "fulfilled"
    ? { healthy: derive.healthy(), spot: derive.spot(), surface: derive.surfaceStats() }
    : { healthy: false, error: results[1]?.reason instanceof Error ? results[1].reason.message : String(results[1]?.reason) },
};
console.info(JSON.stringify(report, null, 2));
if (!deribit.healthy() && !derive.healthy()) process.exitCode = 1;
