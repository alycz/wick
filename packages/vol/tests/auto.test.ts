import { describe, expect, it } from "vitest";
import { AutoVolSource } from "../src/auto.js";
import type { Logger, SpotSnapshot, VolSource } from "../src/types.js";

class TestSource implements VolSource {
  constructor(
    readonly name: "deribit" | "derive" | "realized",
    public isHealthy: boolean,
    private readonly value: number,
  ) {}
  spot(): SpotSnapshot { return { px: 65_000, ts: 1 }; }
  vol(): number { return this.value; }
  healthy(): boolean { return this.isHealthy; }
  async start(): Promise<void> {
    if (this.name === "deribit" && !this.isHealthy) throw new Error("simulated Deribit outage");
  }
}

describe("AutoVolSource", () => {
  it("falls back from failed Deribit to Derive and switches back on recovery", async () => {
    const logs: Array<Record<string, unknown>> = [];
    const logger: Logger = {
      info: (fields) => { logs.push(fields); },
      warn: (fields) => { logs.push(fields); },
    };
    const deribit = new TestSource("deribit", false, 0.5);
    const derive = new TestSource("derive", true, 0.55);
    const realized = new TestSource("realized", true, 0.6);
    const source = new AutoVolSource({ sources: [deribit, derive, realized], logger, timers: false });
    await source.start();
    expect(source.name).toBe("derive");
    expect(source.vol(0, 0)).toBe(0.55);

    deribit.isHealthy = true;
    source.select();
    expect(source.name).toBe("deribit");
    expect(logs.some((entry) => entry.active === "derive")).toBe(true);
    expect(logs.some((entry) => entry.active === "deribit")).toBe(true);
  });

  it("does not silently use an unhealthy explicitly selected source", async () => {
    const deribit = new TestSource("deribit", false, 0.5);
    const derive = new TestSource("derive", true, 0.55);
    const source = new AutoVolSource({ sources: [deribit, derive], mode: "deribit", timers: false });
    await source.start();
    expect(source.healthy()).toBe(false);
    expect(() => source.spot()).toThrow("no healthy vol source");
  });
});
