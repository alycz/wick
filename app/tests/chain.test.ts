// @vitest-environment node

import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { WickBrowserClient, type ConfirmingConnection, type ProgramFacade } from "@/lib/chain";

const DEVNET = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

function harness(options: { genesis?: string; confirmationError?: unknown } = {}) {
  const programId = Keypair.generate().publicKey;
  const owner = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;
  const calls: Array<{ name: string; args: unknown[]; accounts: Record<string, PublicKey> }> = [];
  const method = (name: string) => (...args: unknown[]) => ({
    accounts: (accounts: Record<string, PublicKey>) => ({
      rpc: async () => { calls.push({ name, args, accounts }); return `${name}-signature`; },
    }),
  });
  const program = {
    programId,
    methods: {
      openPosition: method("openPosition"), closePosition: method("closePosition"), settlePosition: method("settlePosition"),
      claimQueue: method("claimQueue"), stake: method("stake"), unstake: method("unstake"), claimRewards: method("claimRewards"),
    },
    account: { lpState: { fetch: vi.fn().mockResolvedValue({ loserMint: Keypair.generate().publicKey, queueTail: { toString: () => "9" } }) } },
  } as unknown as ProgramFacade;
  const connection: ConfirmingConnection = {
    getGenesisHash: vi.fn().mockResolvedValue(options.genesis ?? DEVNET),
    confirmTransaction: vi.fn().mockResolvedValue({ value: { err: options.confirmationError ?? null } }),
  };
  return { client: new WickBrowserClient(program, connection, owner, mint), calls, connection, owner };
}

describe("WickBrowserClient", () => {
  it("derives accounts, submits an open position and confirms it on devnet", async () => {
    const { client, calls, connection, owner } = harness();
    const signature = await client.openPosition({ symbol: "GEMI-BTC15M-UP", side: "yes", marginE6: 25_000_000n, leverage: 4, maxEntryE6: 560_000, nonce: 7n });
    expect(signature).toBe("openPosition-signature");
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("Expected one openPosition call");
    expect(call.name).toBe("openPosition");
    expect(call.accounts.trader?.equals(owner)).toBe(true);
    expect(call.accounts.market).toBeInstanceOf(PublicKey);
    expect(call.accounts.position).toBeInstanceOf(PublicKey);
    expect(connection.confirmTransaction).toHaveBeenCalledWith(signature, "confirmed");
  });

  it("uses on-chain LP state for staking and confirms the transaction", async () => {
    const { client, calls } = harness();
    await expect(client.stake(5_000_000n)).resolves.toBe("stake-signature");
    expect(calls[0]?.args[0]?.toString()).toBe("5000000");
    expect(calls[0]?.accounts.loserMint).toBeInstanceOf(PublicKey);
    expect(calls[0]?.accounts.stakeAccount).toBeInstanceOf(PublicKey);
  });

  it("refuses non-devnet RPCs before submitting", async () => {
    const { client, calls } = harness({ genesis: "mainnet-genesis" });
    await expect(client.openPosition({ symbol: "GEMI-BTC15M-UP", side: "no", marginE6: 1_000_000n, leverage: 1, maxEntryE6: 500_000, nonce: 1n }))
      .rejects.toThrow(/not Solana devnet/);
    expect(calls).toHaveLength(0);
  });

  it("surfaces a confirmed transaction error", async () => {
    const { client } = harness({ confirmationError: { InstructionError: [0, "Custom"] } });
    await expect(client.claimRewards()).rejects.toThrow(/Transaction claimRewards-signature failed/);
  });

  it("includes the config PDA when claiming the payout queue", async () => {
    const { client, calls, owner } = harness();
    await client.claimQueue({ address: Keypair.generate().publicKey.toBase58(), owner: owner.toBase58() });
    const call = calls[0];
    if (!call) throw new Error("Expected one claimQueue call");
    expect(call.name).toBe("claimQueue");
    expect(call.accounts.config).toBeInstanceOf(PublicKey);
  });
});
