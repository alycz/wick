import { web3, type Idl } from "@coral-xyz/anchor";
import { describe, expect, it, vi } from "vitest";
import {
  ConfiguredChainPort,
  createChainPort,
  submitAndConfirmTransaction,
  type ChainTransport,
} from "../src/pricer/chain.js";
import type { CreateMarketRequest, MarkUpdateRequest, OpenPositionRef, SettlementMarketRef } from "../src/pricer/types.js";

const programId = web3.Keypair.generate().publicKey;
const keeper = web3.Keypair.generate();
const requiredInstructions = ["createMarket", "updateMarks", "liquidate", "settleMarket", "voidMarket", "settlePosition", "claimQueue"];
const requiredAccounts = ["config", "lpState", "market", "position", "payoutClaim"];
const instructionShapes: Record<string, { accounts: string[]; args: string[] }> = {
  createMarket: { accounts: ["keeper", "config", "market", "systemProgram"], args: ["symbol", "symbolHash", "kind", "strikeUsdE6", "openTs", "expiryTs", "cutoffSecs", "halfSpreadE6"] },
  updateMarks: { accounts: ["keeper", "config"], args: ["updates"] },
  liquidate: { accounts: ["liquidator", "config", "market", "position", "owner", "lp", "loserMint", "ownerWicked", "tokenProgram", "associatedTokenProgram", "systemProgram"], args: [] },
  settleMarket: { accounts: ["keeper", "config", "market"], args: ["outcome", "settlementValueE6"] },
  voidMarket: { accounts: ["keeper", "config", "market"], args: [] },
  settlePosition: { accounts: ["payer", "config", "market", "position", "owner", "lp", "vault", "usdcMint", "ownerUsdc", "loserMint", "ownerWicked", "claim", "tokenProgram", "associatedTokenProgram", "systemProgram"], args: ["claimIndex"] },
  claimQueue: { accounts: ["payer", "config", "lp", "vault", "usdcMint", "claim", "owner", "ownerUsdc", "tokenProgram", "associatedTokenProgram", "systemProgram"], args: [] },
};
const idl = {
  address: programId.toBase58(),
  metadata: { name: "wick", version: "0.1.0", spec: "0.1.0" },
  instructions: requiredInstructions.map((name) => ({
    name,
    discriminator: [],
    accounts: instructionShapes[name]?.accounts.map((account) => ({ name: account, writable: false, signer: false })) ?? [],
    args: instructionShapes[name]?.args.map((arg) => ({ name: arg, type: "u64" })) ?? [],
  })),
  accounts: requiredAccounts.map((name) => ({ name, discriminator: [] })),
  types: [],
} as unknown as Idl;

class RecordingTransport implements ChainTransport {
  marks: { requests: readonly MarkUpdateRequest[]; priority: number }[] = [];
  marketExists = vi.fn(async () => true);
  createMarket = vi.fn(async (_request: CreateMarketRequest) => "create-signature");
  async updateMarks(requests: readonly MarkUpdateRequest[], priority: number): Promise<string> {
    this.marks.push({ requests, priority });
    return "confirmed-mark-signature";
  }
  listOpenPositions = vi.fn(async (): Promise<readonly OpenPositionRef[]> => []);
  listSettlementMarkets = vi.fn(async (): Promise<readonly SettlementMarketRef[]> => []);
  liquidate = vi.fn(async () => "liquidate-signature");
  settleMarket = vi.fn(async () => "settle-signature");
  voidMarket = vi.fn(async () => "void-signature");
  settleOpenPositions = vi.fn(async () => ["position-signature"]);
  claimQueue = vi.fn(async () => ["claim-signature"]);
}

describe("configured chain port", () => {
  it("stays explicitly unconfigured only when no chain identity is supplied", async () => {
    const port = await createChainPort({ environment: {} });
    expect(port.configured()).toBe(false);
    await expect(port.marketExists("GEMI-BTC")).rejects.toThrow("not configured");
  });

  it("fails closed for partial configuration and placeholder IDLs", async () => {
    await expect(createChainPort({ environment: { PROGRAM_ID: programId.toBase58() }, idl })).rejects.toThrow("configured together");
    const placeholder = { ...idl, instructions: [] } as unknown as Idl;
    await expect(createChainPort({
      environment: { PROGRAM_ID: programId.toBase58(), KEEPER_KEYPAIR: JSON.stringify([...keeper.secretKey]), PUBLIC_SOLANA_RPC_URL: "https://api.devnet.solana.com" },
      idl: placeholder,
    })).rejects.toThrow("missing instruction createMarket");
  });

  it("selects the configured port and forwards write parameters to an injected confirmed transport", async () => {
    const transport = new RecordingTransport();
    const factory = vi.fn(async () => transport);
    const port = await createChainPort({
      environment: { PROGRAM_ID: programId.toBase58(), KEEPER_KEYPAIR: JSON.stringify([...keeper.secretKey]) },
      idl,
      transportFactory: factory,
    });
    expect(port).toBeInstanceOf(ConfiguredChainPort);
    expect(port.configured()).toBe(true);
    const requests = [{ symbol: "GEMI-BTC15M-UP", markE6: 501_000, maxLeverage: 4 }];
    await expect(port.updateMarks(requests, { priorityFeeMicroLamports: 1_000 })).resolves.toBe("confirmed-mark-signature");
    expect(transport.marks).toEqual([{ requests, priority: 1_000 }]);
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ programId, keeper: expect.any(web3.Keypair), rpcUrl: "https://api.devnet.solana.com" }));
  });

  it("submits and explicitly confirms a returned signature", async () => {
    const builder = { rpc: vi.fn(async () => "submitted-signature") };
    const confirmer = { confirmTransaction: vi.fn(async () => ({ context: { slot: 42 }, value: { err: null } })) };
    await expect(submitAndConfirmTransaction(builder, confirmer)).resolves.toBe("submitted-signature");
    expect(builder.rpc).toHaveBeenCalledOnce();
    expect(confirmer.confirmTransaction).toHaveBeenCalledWith("submitted-signature", "confirmed");
  });

  it("does not report an on-chain confirmation error as success", async () => {
    const builder = { rpc: vi.fn(async () => "failed-signature") };
    const confirmer = { confirmTransaction: vi.fn(async () => ({ context: { slot: 43 }, value: { err: { InstructionError: [0, "Custom"] } } })) };
    await expect(submitAndConfirmTransaction(builder, confirmer)).rejects.toThrow("failed-signature");
  });

  it("stops waiting when confirmation outlives the transaction deadline", async () => {
    let releaseConfirmation!: (value: { context: { slot: number }; value: { err: null } }) => void;
    const confirmation = new Promise<{ context: { slot: number }; value: { err: null } }>((resolve) => { releaseConfirmation = resolve; });
    const builder = { rpc: vi.fn(async () => "slow-signature") };
    const confirmer = { confirmTransaction: vi.fn(() => confirmation) };
    const controller = new AbortController();
    const outcome = submitAndConfirmTransaction(builder, confirmer, controller.signal).then(
      () => undefined,
      (error: unknown) => error,
    );
    await vi.waitFor(() => expect(confirmer.confirmTransaction).toHaveBeenCalledOnce());

    controller.abort(new Error("confirmation deadline exceeded"));

    await expect(outcome).resolves.toEqual(expect.objectContaining({ message: "confirmation deadline exceeded" }));
    releaseConfirmation({ context: { slot: 44 }, value: { err: null } });
  });
});
