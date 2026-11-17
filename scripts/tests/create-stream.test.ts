import { describe, expect, it, vi } from "vitest";
import { readEnvironment, requireStreamIdentity, verifyAndSaveFilterTestResult, waitForActiveStream } from "../create-stream.js";

const id = "f6ad6459-b5ad-4183-b370-1c1388e47e83";
const signature = "1".repeat(88);
const programId = "11111111111111111111111111111111";

describe("QuickNode Stream terminal verification", () => {
  it("requires a real UUID from the create response", () => {
    expect(requireStreamIdentity({ id, status: "active" })).toEqual({ id, status: "active" });
    expect(() => requireStreamIdentity({ status: "active" })).toThrow(/valid Stream UUID/);
    expect(() => requireStreamIdentity({ id: "created" })).toThrow(/valid Stream UUID/);
  });

  it("polls the returned Stream until it is active", async () => {
    const getStream = vi.fn()
      .mockResolvedValueOnce({ id, status: "creating" })
      .mockResolvedValueOnce({ id, status: "active" });
    await expect(waitForActiveStream(id, getStream, { pollMs: 0, sleep: async () => undefined })).resolves.toMatchObject({ id, status: "active" });
    expect(getStream).toHaveBeenCalledTimes(2);
  });

  it("rejects paused or mismatched Streams", async () => {
    await expect(waitForActiveStream(id, async () => ({ id, status: "paused" }))).rejects.toThrow(/paused/);
    await expect(waitForActiveStream(id, async () => ({ id: "00000000-0000-4000-8000-000000000000", status: "active" }))).rejects.toThrow(/did not match/);
  });
});

describe("QuickNode filter evidence", () => {
  it("uses the required QuickNode RPC for the real transaction verification path", () => {
    const base = {
      PROGRAM_ID: programId,
      QUICKNODE_API_KEY: "api-key",
      NEXT_PUBLIC_BACKEND_URL: "https://wick.example",
      STREAMS_WEBHOOK_SECRET: "secret",
      PUBLIC_SOLANA_RPC_URL: "https://api.devnet.solana.com",
    };
    expect(() => readEnvironment(base)).toThrow(/QUICKNODE_RPC_URL is required/);
    expect(readEnvironment({ ...base, QUICKNODE_RPC_URL: "https://quicknode.example" }).rpcUrl).toBe("https://quicknode.example");
  });

  it("saves provider output only after the matched transaction is independently verified", async () => {
    const writeEvidence = vi.fn(async () => undefined);
    const testResult = { data: { matchedTransactions: [{ signature, slot: 123 }] } };
    const result = await verifyAndSaveFilterTestResult({
      testResult,
      programId,
      block: "123",
      loadTransaction: async () => ({ signature, slot: 123, succeeded: true, invokedProgramIds: [programId] }),
      writeEvidence,
      now: () => new Date("2026-11-17T12:00:00.000Z"),
    });
    expect(result).toMatchObject({ programId, block: "123", matchedTransaction: { signature, slot: 123 } });
    expect(writeEvidence).toHaveBeenCalledOnce();
  });

  it("does not write evidence for an absent, failed, wrong-slot or wrong-program transaction", async () => {
    const testResult = { matchedTransactions: [{ signature, slot: 123 }] };
    for (const transaction of [
      null,
      { signature, slot: 123, succeeded: false, invokedProgramIds: [programId] },
      { signature, slot: 124, succeeded: true, invokedProgramIds: [programId] },
      { signature, slot: 123, succeeded: true, invokedProgramIds: ["other-program"] },
    ]) {
      const writeEvidence = vi.fn(async () => undefined);
      await expect(verifyAndSaveFilterTestResult({
        testResult, programId, block: "123", loadTransaction: async () => transaction, writeEvidence,
      })).rejects.toThrow(/No QuickNode filter-test match could be verified/);
      expect(writeEvidence).not.toHaveBeenCalled();
    }
  });
});
