import { describe, expect, it } from "vitest";
import { BRAND, e6ToUsdc, mulDiv, probabilityToE6, usdcToE6 } from "../src/index.js";

describe("shared invariants", () => {
  it("keeps Wick and $WICKED in one brand constant", () => {
    expect(BRAND.name).toBe("Wick");
    expect(BRAND.tokenName).toBe("$WICKED");
  });

  it("uses deterministic six-decimal arithmetic", () => {
    expect(usdcToE6(12.345678)).toBe(12_345_678n);
    expect(e6ToUsdc(12_345_678n)).toBe(12.345678);
    expect(mulDiv(10n, 7n, 3n)).toBe(23n);
    expect(probabilityToE6(0.624)).toBe(624_000);
  });
});
