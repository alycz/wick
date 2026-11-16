import type { Clock, SpotSnapshot, VolSource } from "./types.js";

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

export interface RealizedOptions {
  now?: Clock;
  lambdaPerMinute?: number;
  staleAfterMs?: number;
  minSamples?: number;
}

export class RealizedVolSource implements VolSource {
  readonly name = "realized" as const;
  private readonly now: Clock;
  private readonly lambdaPerMinute: number;
  private readonly staleAfterMs: number;
  private readonly minSamples: number;
  private latest: SpotSnapshot = { px: Number.NaN, ts: 0 };
  private variancePerSecond = 0;
  private samples = 0;

  constructor(options: RealizedOptions = {}) {
    this.now = options.now ?? Date.now;
    this.lambdaPerMinute = options.lambdaPerMinute ?? 0.94;
    this.staleAfterMs = options.staleAfterMs ?? 5_000;
    this.minSamples = options.minSamples ?? 30;
  }

  observeSpot(px: number, ts = this.now()): void {
    if (!Number.isFinite(px) || px <= 0) throw new RangeError("spot must be positive");
    if (this.latest.ts > 0 && ts <= this.latest.ts) return;
    if (this.latest.ts > 0) {
      const elapsedSeconds = Math.max((ts - this.latest.ts) / 1_000, 1e-3);
      const returnPerSecond = Math.log(px / this.latest.px) / Math.sqrt(elapsedSeconds);
      const lambda = this.lambdaPerMinute ** (elapsedSeconds / 60);
      this.variancePerSecond = this.samples === 0
        ? returnPerSecond ** 2
        : lambda * this.variancePerSecond + (1 - lambda) * returnPerSecond ** 2;
      this.samples += 1;
    }
    this.latest = { px, ts };
  }

  spot(): SpotSnapshot { return { ...this.latest }; }
  vol(_expiryMs: number, _strike: number): number {
    if (this.samples === 0) throw new Error("realized vol has no returns");
    return Math.sqrt(this.variancePerSecond * SECONDS_PER_YEAR);
  }
  healthy(): boolean {
    return this.samples >= this.minSamples
      && Number.isFinite(this.latest.px)
      && this.now() - this.latest.ts <= this.staleAfterMs
      && Number.isFinite(this.variancePerSecond)
      && this.variancePerSecond > 0;
  }
  sampleCount(): number { return this.samples; }
}
