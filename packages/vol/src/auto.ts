import type { Clock, Logger, SpotSnapshot, VolSource } from "./types.js";

export type VolMode = "auto" | "deribit" | "derive" | "realized";

export interface AutoVolOptions {
  sources: readonly VolSource[];
  mode?: VolMode;
  logger?: Logger;
  now?: Clock;
  selectEveryMs?: number;
  probeEveryMs?: number;
  timers?: boolean;
}

const consoleLogger: Logger = {
  info: (fields, message) => console.info(JSON.stringify({ level: "info", message, ...fields })),
  warn: (fields, message) => console.warn(JSON.stringify({ level: "warn", message, ...fields })),
};

export class AutoVolSource implements VolSource {
  private readonly sources: readonly VolSource[];
  private readonly mode: VolMode;
  private readonly logger: Logger;
  private readonly selectEveryMs: number;
  private readonly probeEveryMs: number;
  private readonly timers: boolean;
  private active: VolSource | undefined;
  private selectTimer?: ReturnType<typeof setInterval>;
  private probeTimer?: ReturnType<typeof setInterval>;

  constructor(options: AutoVolOptions) {
    this.sources = options.sources;
    this.mode = options.mode ?? (process.env.VOL_SOURCE as VolMode | undefined) ?? "auto";
    this.logger = options.logger ?? consoleLogger;
    this.selectEveryMs = options.selectEveryMs ?? 1_000;
    this.probeEveryMs = options.probeEveryMs ?? 60_000;
    this.timers = options.timers ?? true;
    if (this.sources.length === 0) throw new Error("at least one vol source is required");
    if (!["auto", "deribit", "derive", "realized"].includes(this.mode)) throw new Error(`invalid VOL_SOURCE ${this.mode}`);
  }

  get name(): "deribit" | "derive" | "realized" {
    if (!this.active) throw new Error("vol source has not started");
    return this.active.name;
  }

  async start(): Promise<void> {
    await Promise.all(this.sources.map(async (source) => {
      try { await source.start?.(); }
      catch (error) { this.logger.warn({ source: source.name, error: error instanceof Error ? error.message : String(error) }, "Vol source startup failed"); }
    }));
    this.select();
    if (this.timers) {
      this.selectTimer = setInterval(() => this.select(), this.selectEveryMs);
      this.probeTimer = setInterval(() => void this.probeSources(), this.probeEveryMs);
    }
  }

  async stop(): Promise<void> {
    if (this.selectTimer) clearInterval(this.selectTimer);
    if (this.probeTimer) clearInterval(this.probeTimer);
    await Promise.all(this.sources.map((source) => source.stop?.()));
  }

  spot(): SpotSnapshot { return this.requireActive().spot(); }
  vol(expiryMs: number, strike: number): number { return this.requireActive().vol(expiryMs, strike); }
  healthy(): boolean { return this.active?.healthy() ?? false; }
  activeSource(): VolSource { return this.requireActive(); }

  select(): void {
    this.feedRealizedObservers();
    const candidates = this.mode === "auto"
      ? this.sources
      : this.sources.filter((source) => source.name === this.mode);
    const next = candidates.find((source) => source.healthy());
    if (!next) {
      if (this.active) this.logger.warn({ previous: this.active.name, mode: this.mode }, "No healthy vol source available");
      this.active = undefined;
      return;
    }
    if (next !== this.active) {
      const previous = this.active?.name ?? null;
      this.active = next;
      this.logger.info({ previous, active: next.name, mode: this.mode }, "Vol source switched");
    }
  }

  private feedRealizedObservers(): void {
    const feed = this.sources.find((source) => source.name !== "realized" && source.healthy());
    if (!feed) return;
    const spot = feed.spot();
    for (const source of this.sources) {
      if (source.name === "realized") source.observeSpot?.(spot.px, spot.ts);
    }
  }

  private async probeSources(): Promise<void> {
    await Promise.all(this.sources.map(async (source) => {
      try { await source.probe?.(); }
      catch (error) { this.logger.warn({ source: source.name, error: error instanceof Error ? error.message : String(error) }, "Vol source probe failed"); }
    }));
    this.select();
  }

  private requireActive(): VolSource {
    if (!this.active) throw new Error("no healthy vol source");
    return this.active;
  }
}
