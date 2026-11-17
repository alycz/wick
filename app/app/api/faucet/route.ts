import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FaucetInventoryDepletedError, sendFaucetGrant } from "@/lib/faucet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ publicKey: z.string(), browserId: z.string().uuid() });
const WINDOW_MS = 10 * 60_000;
// These controls reduce accidental repeat requests within one warm instance.
// The cryptographic 200-grant cap is the authority-revoked on-chain inventory.
const state = globalThis as typeof globalThis & { wickFaucet?: { funded: Map<string, number>; inFlight: Set<string> } };
state.wickFaucet ??= { funded: new Map(), inFlight: new Set() };

function keypair(value: string | undefined, name: string): Keypair {
  if (!value) throw new Error(`${name} is not configured`);
  const trimmed = value.trim();
  let bytes: Uint8Array;
  if (trimmed.startsWith("[")) bytes = Uint8Array.from(JSON.parse(trimmed) as number[]);
  else if (trimmed.includes("/") && !/^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)) bytes = Uint8Array.from(JSON.parse(readFileSync(trimmed, "utf8")) as number[]);
  else bytes = bs58.decode(trimmed);
  return Keypair.fromSecretKey(bytes);
}

export async function POST(request: NextRequest) {
  let rateKey = "";
  try {
    const body = requestSchema.parse(await request.json());
    const recipient = new PublicKey(body.publicKey);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    rateKey = `${body.browserId}:${ip}`;
    const faucet = state.wickFaucet!;
    const last = faucet.funded.get(rateKey);
    if (last && Date.now() - last < WINDOW_MS) return NextResponse.json({ message: "This browser was funded less than 10 minutes ago." }, { status: 429 });
    if (faucet.inFlight.has(rateKey)) return NextResponse.json({ message: "A funding request is already in progress." }, { status: 409 });
    faucet.inFlight.add(rateKey);

    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
    const mintAddress = process.env.USDC_TEST_MINT ?? process.env.NEXT_PUBLIC_USDC_TEST_MINT;
    if (!rpcUrl || !mintAddress) throw new Error("Devnet faucet is not configured");
    const treasury = keypair(process.env.TREASURY_KEYPAIR, "TREASURY_KEYPAIR");
    const mint = new PublicKey(mintAddress);
    const connection = new Connection(rpcUrl, "confirmed");
    const signature = await sendFaucetGrant({ connection, mint, recipient, treasury });
    faucet.funded.set(rateKey, Date.now());
    return NextResponse.json({ signature, cluster: "devnet", sol: 0.05, testUsdc: 1_000 });
  } catch (error) {
    if (error instanceof FaucetInventoryDepletedError) return NextResponse.json({ message: error.message }, { status: 429 });
    // Configuration, key parsing, RPC and transaction details stay server-side.
    return NextResponse.json({ message: "Demo faucet is temporarily unavailable." }, { status: 503 });
  } finally {
    if (rateKey) state.wickFaucet!.inFlight.delete(rateKey);
  }
}
