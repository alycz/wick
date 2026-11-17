import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useFeedMock } = vi.hoisted(() => ({ useFeedMock: vi.fn() }));
vi.mock("@/hooks/use-feed", () => ({ useFeed: useFeedMock }));

import { ActivityRail } from "@/components/activity-rail";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useFeedMock.mockReset();
});

describe("ActivityRail", () => {
  it("claims live QuickNode delivery only for a recent Stream event", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_030_000);
    useFeedMock.mockReturnValue({
      connected: true, loading: false, events: [{
        signature: "stream-signature", eventIndex: 0, slot: 1, blockTime: 1_700_000_000,
        name: "PositionOpened", data: {}, provenance: "quicknode_stream",
      }],
    });
    render(<ActivityRail />);
    expect(screen.getByText(/Live via QuickNode Streams/)).toBeInTheDocument();
  });

  it("marks reconciled or unavailable feeds as unverified", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_030_000);
    useFeedMock.mockReturnValue({
      connected: true, loading: false, events: [{
        signature: "reconciled-signature", eventIndex: 0, slot: 1, blockTime: 1_700_000_000,
        name: "PositionOpened", data: {}, provenance: "rpc_reconcile",
      }],
    });
    render(<ActivityRail />);
    expect(screen.getByText(/QuickNode Stream unverified · awaiting live event/)).toBeInTheDocument();
    expect(screen.queryByText(/^Live via QuickNode Streams$/)).not.toBeInTheDocument();
    expect(screen.getByText(/RPC reconciled/)).toBeInTheDocument();
  });

  it("does not treat a future-dated Stream frame as live evidence", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    useFeedMock.mockReturnValue({
      connected: true, loading: false, events: [{
        signature: "future-stream-signature", eventIndex: 0, slot: 1, blockTime: 1_700_000_120,
        name: "PositionOpened", data: {}, provenance: "quicknode_stream",
      }],
    });
    render(<ActivityRail />);
    expect(screen.getByText(/QuickNode Stream unverified · awaiting live event/)).toBeInTheDocument();
  });
});
