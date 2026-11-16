import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { PUBLIC_DEVNET_RPC } from "../packages/shared/src/constants.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadKeypair } from "./keypairs.js";
import { assertDevnet, requiredEnv, waitForConfirmedSignature } from "./lib/runtime.js";

export interface AirdropOptions { recipient: PublicKey; sol: number; rpcUrls: string[]; dryRun?: boolean }

export async function requestDevnetAirdrop(options: AirdropOptions): Promise<string | undefined> {
  if (!Number.isFinite(options.sol) || options.sol <= 0 || options.sol > 2) throw new RangeError("--sol must be greater than 0 and no more than the devnet 2 SOL request cap");
  if (options.rpcUrls.length === 0) throw new Error("No devnet RPC endpoint is configured");
  if (options.dryRun) {
    console.info(JSON.stringify({ event: "airdrop_dry_run", recipient: options.recipient.toBase58(), sol: options.sol, endpoints: options.rpcUrls.length, submitted: false }));
    return undefined;
  }
  const errors: string[] = [];
  for (const rpcUrl of options.rpcUrls) {
    try {
      const connection = new Connection(rpcUrl, "confirmed");
      await assertDevnet(connection);
      const signature = await connection.requestAirdrop(options.recipient, Math.round(options.sol * LAMPORTS_PER_SOL));
      await waitForConfirmedSignature(connection, signature);
      console.info(JSON.stringify({ event: "airdrop_confirmed", recipient: options.recipient.toBase58(), sol: options.sol, signature }));
      return signature;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`Every configured devnet faucet failed; no airdrop was confirmed: ${errors.join(" | ")}`);
}

async function main(): Promise<void> {
  const recipientFlag = process.argv.indexOf("--recipient");
  const solFlag = process.argv.indexOf("--sol");
  const recipient = recipientFlag >= 0
    ? new PublicKey(process.argv[recipientFlag + 1] ?? "")
    : (await loadKeypair(requiredEnv("TREASURY_KEYPAIR"), "TREASURY_KEYPAIR")).publicKey;
  const sol = solFlag >= 0 ? Number(process.argv[solFlag + 1]) : 2;
  const rpcUrls = [process.env.PUBLIC_SOLANA_RPC_URL?.trim() || PUBLIC_DEVNET_RPC, process.env.QUICKNODE_RPC_URL?.trim()].filter((value): value is string => Boolean(value));
  await requestDevnetAirdrop({ recipient, sol, rpcUrls, dryRun: process.argv.includes("--dry-run") });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
