import { describe, expect, it } from "vitest";
import { assertLeverageClamp, captionsForObservedTimeline, proveClamp, requireCorrelatedEvent, srtFromMarkdown } from "../record-demo.js";

describe("record-demo captions", () => {
  it("extracts the caption source from docs markdown", () => {
    expect(srtFromMarkdown("# Demo\n\n```srt\n1\n00:00:00,000 --> 00:00:01,000\nWick\n```\n")).toContain("00:00:00,000");
  });

  it("fails when captions are absent", () => {
    expect(() => srtFromMarkdown("# Demo")).toThrow("fenced srt");
  });

  it("rejects an unrelated injected Stream event with the same label", () => {
    const feed = [{
      signature: "different-signature", eventIndex: 0, name: "PositionOpened",
      data: { market: "different-market", position: "different-position" },
    }];
    expect(() => requireCorrelatedEvent(feed, {
      name: "PositionOpened", signature: "trade-signature", market: "trade-market", position: "trade-position",
    })).toThrow(/No correlated PositionOpened Stream event/);
  });

  it("fails when the injected Playwright clamp state did not clamp to the visible cap", () => {
    expect(() => assertLeverageClamp({ requested: 1_000, cap: 4, actualValue: 1_000, visibleText: "Leverage 4× / 4× cap" }))
      .toThrow(/clamp failed/);
    expect(() => assertLeverageClamp({ requested: 1_000, cap: 4, actualValue: 4, visibleText: "Leverage" }))
      .toThrow(/not visibly evidenced/);
  });

  it("does not suppress a failed clamp read from an injected Playwright driver", async () => {
    let requested: number | undefined;
    await expect(proveClamp({
      max: async () => "4",
      request: async (value) => { requested = value; },
      value: async () => "1000",
      visibleText: async () => "Leverage 4× / 4× cap",
    }, 1_000)).rejects.toThrow(/clamp failed/);
    expect(requested).toBe(1_000);
  });

  it("uses observed shot boundaries without rescaling the raw timeline", () => {
    const markdown = `\`\`\`srt\n${Array.from({ length: 8 }, (_, index) => `${index + 1}\n00:00:00,000 --> 00:00:01,000\nShot ${index + 1}`).join("\n\n")}\n\`\`\``;
    const captions = captionsForObservedTimeline(markdown, {
      markets: 0, weekly: 18.25, wallet: 39, trade: 61, opened: 85, liquidated: 109, settled: 133, pool: 153,
    }, 166.5);
    expect(captions).toContain("00:00:18,250 --> 00:00:39,000");
    expect(captions).toContain("00:02:33,000 --> 00:02:46,500");
  });
});
