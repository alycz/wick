import type { VolSourceName } from "@wick/shared";

export interface SpotSnapshot {
  px: number;
  ts: number;
}

export interface VolSource {
  readonly name: VolSourceName;
  spot(): SpotSnapshot;
  vol(expiryMs: number, strike: number): number;
  healthy(): boolean;
  observeSpot?(px: number, ts?: number): void;
  start?(): Promise<void>;
  stop?(): Promise<void> | void;
  probe?(): Promise<void>;
}

export interface VolPoint {
  expiryMs: number;
  strike: number;
  vol: number;
  forward: number;
  ts: number;
}

export interface Logger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type Clock = () => number;
