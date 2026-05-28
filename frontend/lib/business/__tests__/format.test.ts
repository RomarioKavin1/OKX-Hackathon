import { describe, it, expect } from "vitest";
import { toUsdc, fmtUsdc } from "../format";

describe("usdc format", () => {
  it("round-trips 12.5 USDC at 6 decimals", () => {
    expect(toUsdc(12.5)).toBe(12_500000n);
    expect(fmtUsdc(12_500000n)).toBe("12.50");
  });
});
