import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PUBLIC_DEVNET_RPC } from "../packages/shared/src/constants.js";
import { loadOrCreateKeypair } from "./keypairs.js";
import { assertDevnet, waitForConfirmedSignature } from "./lib/runtime.js";
import { fileURLToPath } from "node:url";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1_000;
const KEEPER_TARGET = LAMPORTS_PER_SOL;
const TREASURY_RESERVE = 500_000_000;
const statePath = resolve(".state/sol-collector.json");

interface CollectorState { lastAirdrop: Record<string, number> }

async function loadState(): Promise<CollectorState> {
  try { return JSON.parse(await readFile(statePath, "utf8")) as CollectorState; }
  catch { return { lastAirdrop: {} }; }
}

async function saveState(state: CollectorState): Promise<void> {
  await mkdir(resolve(".state"), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function requestConservativeAirdrop(connection: Connection, treasury: PublicKey, endpointName: string, state: CollectorState): Promise<void> {
  const now = Date.now();
  if (now - (state.lastAirdrop[endpointName] ?? 0) < EIGHT_HOURS_MS) return;
  // Record every attempt before making the request. Closed or rate-limited faucets
  // must not be retried on the 15-minute maintenance cadence.
  state.lastAirdrop[endpointName] = now;
  await saveState(state);
  try {
    const signature = await connection.requestAirdrop(treasury, 2 * LAMPORTS_PER_SOL);
    await waitForConfirmedSignature(connection, signature);
    console.info(JSON.stringify({ event: "airdrop_confirmed", endpoint: endpointName, signature }));
  } catch (error) {
    console.warn(JSON.stringify({ event: "airdrop_failed", endpoint: endpointName, message: error instanceof Error ? error.message : String(error) }));
  }
}

async function topUp(connection: Connection, treasury: Keypair, target: PublicKey, minimum: number): Promise<void> {
  const current = await connection.getBalance(target, "confirmed");
  if (current >= minimum) return;
  const treasuryBalance = await connection.getBalance(treasury.publicKey, "confirmed");
  const amount = Math.min(minimum - current, Math.max(0, treasuryBalance - TREASURY_RESERVE));
  if (amount <= 0) return;
  const transaction = new Transaction().add(SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: target, lamports: amount }));
  const signature = await sendAndConfirmTransaction(connection, transaction, [treasury], { commitment: "confirmed" });
  console.info(JSON.stringify({ event: "top_up", target: target.toBase58(), lamports: amount, signature }));
}

export async function collectorCycle(): Promise<void> {
  const treasury = await loadOrCreateKeypair(process.env.TREASURY_KEYPAIR ?? ".keys/treasury.json");
  const keeper = await loadOrCreateKeypair(process.env.KEEPER_KEYPAIR ?? ".keys/keeper.json");
  const state = await loadState();
  const publicConnection = new Connection(process.env.PUBLIC_SOLANA_RPC_URL ?? PUBLIC_DEVNET_RPC, "confirmed");
  await assertDevnet(publicConnection);
  await requestConservativeAirdrop(publicConnection, treasury.publicKey, "public-devnet", state);
  const quickNodeUrl = process.env.QUICKNODE_RPC_URL;
  if (quickNodeUrl) {
    const quickNodeConnection = new Connection(quickNodeUrl, "confirmed");
    await assertDevnet(quickNodeConnection);
    await requestConservativeAirdrop(quickNodeConnection, treasury.publicKey, "quicknode-devnet", state);
  }
  await topUp(publicConnection, treasury, keeper.publicKey, KEEPER_TARGET);
  const balances = await Promise.all([
    publicConnection.getBalance(treasury.publicKey),
    publicConnection.getBalance(keeper.publicKey),
  ]);
  console.info(JSON.stringify({ event: "collector_status", treasury: treasury.publicKey.toBase58(), keeper: keeper.publicKey.toBase58(), balances }));
}

async function main(): Promise<void> {
  let stopped = false;
  process.once("SIGTERM", () => { stopped = true; });
  process.once("SIGINT", () => { stopped = true; });
  do {
    await collectorCycle().catch((error) => console.error(JSON.stringify({ event: "collector_cycle_failed", message: error instanceof Error ? error.message : String(error) })));
    if (!stopped) await new Promise((resolveDelay) => setTimeout(resolveDelay, 15 * 60 * 1_000));
  } while (!stopped);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
