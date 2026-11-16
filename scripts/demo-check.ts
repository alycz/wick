import { Connection, PublicKey } from "@solana/web3.js";
import type { PricerMarket } from "../packages/shared/src/types.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadKeypair } from "./keypairs.js";
import { evaluateDemoSnapshot, type DemoFeedEvent, type DemoHealth } from "./lib/demo-check.js";
import { assertDevnet, fetchJson, requiredEnv } from "./lib/runtime.js";

export async function runDemoCheck(): Promise<ReturnType<typeof evaluateDemoSnapshot>> {
  const backendUrl = requiredEnv("NEXT_PUBLIC_BACKEND_URL").replace(/\/$/, "");
  const rpcUrl = process.env.PUBLIC_SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
  const [keeper, treasury] = await Promise.all([
    loadKeypair(requiredEnv("KEEPER_KEYPAIR"), "KEEPER_KEYPAIR"),
    loadKeypair(requiredEnv("TREASURY_KEYPAIR"), "TREASURY_KEYPAIR"),
  ]);
  const connection = new Connection(rpcUrl, "confirmed");
  await assertDevnet(connection);
  const programId = new PublicKey(requiredEnv("PROGRAM_ID"));
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault")], programId);
  const [health, markets, feed, vaultBalance, keeperLamports, treasuryLamports] = await Promise.all([
    fetchJson<DemoHealth>(`${backendUrl}/health`),
    fetchJson<PricerMarket[]>(`${backendUrl}/markets`),
    fetchJson<DemoFeedEvent[]>(`${backendUrl}/feed?limit=50`),
    connection.getTokenAccountBalance(vault, "confirmed"),
    connection.getBalance(keeper.publicKey, "confirmed"),
    connection.getBalance(treasury.publicKey, "confirmed"),
  ]);
  return evaluateDemoSnapshot({ health, markets, feed, vaultAmountE6: BigInt(vaultBalance.value.amount), keeperLamports, treasuryLamports, nowMs: Date.now() });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.info(JSON.stringify(await runDemoCheck(), null, 2));
}
