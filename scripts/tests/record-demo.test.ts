import { describe, expect, it } from "vitest";
import { srtFromMarkdown } from "../record-demo.js";

describe("record-demo captions", () => {
  it("extracts the caption source from docs markdown", () => {
    expect(srtFromMarkdown("# Demo\n\n```srt\n1\n00:00:00,000 --> 00:00:01,000\nWick\n```\n")).toContain("00:00:00,000");
  });

  it("fails when captions are absent", () => {
    expect(() => srtFromMarkdown("# Demo")).toThrow("fenced srt");
  });
});
