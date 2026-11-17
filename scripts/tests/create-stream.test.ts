import { describe, expect, it, vi } from "vitest";
import {
  readEnvironment,
  requirePublicBackendOrigin,
  requireStreamIdentity,
  verifyAndSaveFilterTestResult,
  waitForActiveStream,
} from "../create-stream.js";
import { verifyActiveStreamConfig } from "../lib/quicknode-evidence.js";

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

  it("requires a public origin-only HTTPS backend", () => {
    expect(requirePublicBackendOrigin("https://wick.example/")).toBe("https://wick.example");
    for (const value of [
      "http://wick.example", "https://localhost", "https://127.0.0.1", "https://10.0.0.1",
      "https://100.64.0.1", "https://[::1]", "https://[::ffff:127.0.0.1]",
      "https://user:pass@wick.example", "https://wick.example/api", "https://wick.example?token=secret",
    ]) expect(() => requirePublicBackendOrigin(value)).toThrow(/public origin-only HTTPS/);
  });

  it("verifies the active provider config and returns sanitized evidence", () => {
    const filterFunction = Buffer.from("function main() {}").toString("base64");
    const evidence = verifyActiveStreamConfig({
      providerStream: {
        id,
        status: "active",
        network: "solana-devnet",
        dataset: "block",
        external_id: "wick-solana-devnet-program-events-v1",
        destination: "webhook",
        destination_attributes: { url: "https://wick.example/streams/webhook", headers: { "x-wick-stream-secret": "never-save" } },
        filter_function: filterFunction,
      },
      streamId: id,
      programId,
      destinationUrl: "https://wick.example/streams/webhook",
      filterFunction,
      filterSha256: "a".repeat(64),
      now: () => new Date("2026-11-17T12:00:00.000Z"),
    });
    expect(evidence).toEqual({
      schemaVersion: 1,
      streamId: id,
      externalId: "wick-solana-devnet-program-events-v1",
      status: "active",
      network: "solana-devnet",
      dataset: "block",
      destinationUrl: "https://wick.example/streams/webhook",
      filterSha256: "a".repeat(64),
      programId,
      verifiedAt: "2026-11-17T12:00:00.000Z",
    });
    expect(JSON.stringify(evidence)).not.toContain("never-save");
  });

  it("rejects active Streams whose provider config differs from the reviewed request", () => {
    const base = {
      id,
      status: "active",
      network: "solana-devnet",
      dataset: "block",
      external_id: "wick-solana-devnet-program-events-v1",
      destination: "webhook",
      destination_attributes: { url: "https://wick.example/streams/webhook" },
      filter_function: "expected-filter",
    };
    const verify = (providerStream: unknown) => verifyActiveStreamConfig({
      providerStream,
      streamId: id,
      programId,
      destinationUrl: "https://wick.example/streams/webhook",
      filterFunction: "expected-filter",
      filterSha256: "a".repeat(64),
    });
    expect(() => verify({ ...base, dataset: "transactions" })).toThrow(/block dataset/);
    expect(() => verify({ ...base, destination_attributes: { url: "https://other.example/streams/webhook" } })).toThrow(/webhook destination/);
    expect(() => verify({ ...base, filter_function: "different" })).toThrow(/reviewed Wick filter/);
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
