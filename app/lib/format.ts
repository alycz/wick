export function cents(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(1)}¢`;
}

export function dollars(value: number | undefined, maximumFractionDigits = 0): string {
  return value === undefined || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits }).format(value);
}

export function compactAddress(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 5)}…${value.slice(-5)}`;
}

export function e6(value: string | number | bigint | undefined): number {
  if (value === undefined) return 0;
  return Number(value) / 1_000_000;
}

export function durationCountdown(expiryTs: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((expiryTs - now) / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}:${remainder.toString().padStart(2, "0")}`;
}
