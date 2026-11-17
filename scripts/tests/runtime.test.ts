import { Keypair } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { requestDevnetAirdrop } from "../airdrop.js";
import { deploymentPlan } from "../deploy.js";
import { DEVNET_GENESIS_HASH, assertDevnet, requiredEnv } from "../lib/runtime.js";

describe("script safety helpers", () => {
  it("refuses a non-devnet genesis hash", async () => {
    await expect(assertDevnet({ getGenesisHash: vi.fn().mockResolvedValue("mainnet") })).rejects.toThrow("Refusing non-devnet RPC");
    // Literal independently observed via public devnet getGenesisHash; do not mirror the implementation constant.
    const liveDevnetGenesis = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
    expect(DEVNET_GENESIS_HASH).toBe(liveDevnetGenesis);
    await expect(assertDevnet({ getGenesisHash: vi.fn().mockResolvedValue(liveDevnetGenesis) })).resolves.toBeUndefined();
    await expect(assertDevnet({ getGenesisHash: vi.fn().mockResolvedValue("EtWTRABZaYq6iMfeYKouRu166VU2xqa1") })).rejects.toThrow("Refusing non-devnet RPC");
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
