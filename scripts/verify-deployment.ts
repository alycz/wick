import { getMint } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import type { PricerMarket } from "../packages/shared/src/types.js";
import { assertDevnet, fetchJson, requiredEnv } from "./lib/runtime.js";

interface Health {
  ok: boolean;
  cluster: string;
  chainConfigured: boolean;
  volHealthy: boolean;
}

interface FeedEvent { blockTime: number }

const rpcUrl = process.env.PUBLIC_SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
const programId = new PublicKey(requiredEnv("PROGRAM_ID"));
const mintId = new PublicKey(requiredEnv("USDC_TEST_MINT"));
const backendUrl = requiredEnv("NEXT_PUBLIC_BACKEND_URL").replace(/\/$/, "");
const frontendUrl = requiredEnv("FRONTEND_URL").replace(/\/$/, "");
const connection = new Connection(rpcUrl, "confirmed");

await assertDevnet(connection);
const [program, mint, health, markets, feed, frontend] = await Promise.all([
  connection.getAccountInfo(programId, "confirmed"),
  getMint(connection, mintId, "confirmed"),
  fetchJson<Health>(`${backendUrl}/health`),
  fetchJson<PricerMarket[]>(`${backendUrl}/markets`),
  fetchJson<FeedEvent[]>(`${backendUrl}/feed?limit=10`),
  fetch(frontendUrl, { signal: AbortSignal.timeout(10_000) }),
]);

if (!program?.executable) throw new Error("Configured Wick program is not executable on devnet");
if (mint.decimals !== 6) throw new Error(`Test USDC mint uses ${mint.decimals} decimals, expected 6`);
if (!health.ok || health.cluster !== "devnet" || !health.chainConfigured || !health.volHealthy) {
  throw new Error("Backend health is not fully ready for the devnet lifecycle");
}
if (!markets.some((market) => market.duration === "15m" && market.status === "open")) throw new Error("No live BTC 15-minute market is available");
if (!feed.some((event) => Date.now() - event.blockTime * 1_000 <= 60_000)) throw new Error("QuickNode-backed feed has no event from the last 60 seconds");
if (!frontend.ok || !(await frontend.text()).includes("Wick")) throw new Error("Frontend is not serving Wick successfully");

console.info(JSON.stringify({
  verified: true,
  cluster: "devnet",
  programId: programId.toBase58(),
  mint: mintId.toBase58(),
  mintDecimals: mint.decimals,
  backendUrl,
  frontendUrl,
  marketCount: markets.length,
  recentFeedEvents: feed.length,
}, null, 2));
