import type { IndexedEvent } from "@wick/shared";
import { describe, expect, it } from "vitest";
import { mergeIndexedEvents } from "@/lib/feed";

function event(overrides: Partial<IndexedEvent> = {}): IndexedEvent {
  return {
    signature: "signature-a", eventIndex: 0, slot: 100, blockTime: 1_700_000_000,
    name: "PositionOpened", data: {}, provenance: "rpc_reconcile", ...overrides,
  };
}

describe("mergeIndexedEvents", () => {
  it("deduplicates REST/SSE overlap and preserves QuickNode provenance", () => {
    expect(mergeIndexedEvents(
      [event()],
      [event({ provenance: "quicknode_stream" })],
    )).toEqual([event({ provenance: "quicknode_stream" })]);
  });

  it("orders newest events deterministically and caps the feed", () => {
    const input = Array.from({ length: 55 }, (_, index) => event({
      signature: `signature-${index.toString().padStart(2, "0")}`,
      eventIndex: index % 2,
      slot: 100 + index,
      blockTime: 1_700_000_000 + Math.floor(index / 2),
    }));
    const merged = mergeIndexedEvents(input);
    expect(merged).toHaveLength(50);
    expect(merged[0]?.signature).toBe("signature-54");
    expect(merged.at(-1)?.signature).toBe("signature-05");
  });
});
