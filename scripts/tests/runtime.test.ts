import { Keypair } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { requestDevnetAirdrop } from "../airdrop.js";
import { deploymentPlan } from "../deploy.js";
import { DEVNET_GENESIS_HASH, assertDevnet, requiredEnv } from "../lib/runtime.js";

describe("script safety helpers", () => {
  it("refuses a non-devnet genesis hash", async () => {
    await expect(assertDevnet({ getGenesisHash: vi.fn().mockResolvedValue("mainnet") })).rejects.toThrow("Refusing non-devnet RPC");
    await expect(assertDevnet({ getGenesisHash: vi.fn().mockResolvedValue(DEVNET_GENESIS_HASH) })).resolves.toBeUndefined();
  });

  it("validates deployment inputs without inventing identifiers", () => {
    const id = Keypair.generate().publicKey.toBase58();
    expect(deploymentPlan({ PROGRAM_ID: id, ADMIN_KEYPAIR: "admin.json", PUBLIC_SOLANA_RPC_URL: "https://api.devnet.solana.com" })).toMatchObject({ programId: id, authorityKeypair: "admin.json" });
    expect(() => requiredEnv("MISSING", {})).toThrow("MISSING is required");
  });

  it("dry-run airdrop submits nothing", async () => {
    await expect(requestDevnetAirdrop({ recipient: Keypair.generate().publicKey, sol: 2, rpcUrls: ["https://api.devnet.solana.com"], dryRun: true })).resolves.toBeUndefined();
    await expect(requestDevnetAirdrop({ recipient: Keypair.generate().publicKey, sol: 3, rpcUrls: [], dryRun: true })).rejects.toThrow("2 SOL request cap");
  });
});
