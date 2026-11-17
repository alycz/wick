import { describe, expect, it, vi } from "vitest";
import { requireStreamIdentity, waitForActiveStream } from "../create-stream.js";

const id = "f6ad6459-b5ad-4183-b370-1c1388e47e83";

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
