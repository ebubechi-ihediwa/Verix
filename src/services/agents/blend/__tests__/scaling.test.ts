import { describe, it, expect } from "vitest";
import { toBlendAmount, fromBlendAmount } from "@/services/agents/blend/scaling";

describe("toBlendAmount (7-decimal i128)", () => {
  it("scales whole and fractional amounts", () => {
    expect(toBlendAmount(1)).toBe(BigInt(10_000_000));
    expect(toBlendAmount(0.1)).toBe(BigInt(1_000_000));
    expect(toBlendAmount(250)).toBe(BigInt(2_500_000_000));
    expect(toBlendAmount(0)).toBe(BigInt(0));
  });

  it("handles edge cases: smallest unit, exact 7-dp, large amounts", () => {
    expect(toBlendAmount(0.0000001)).toBe(BigInt(1)); // 1 stroop
    expect(toBlendAmount(123.4567891)).toBe(BigInt("1234567891")); // exactly 7 dp
    expect(toBlendAmount(1_000_000)).toBe(BigInt("10000000000000"));
  });

  it("rounds beyond 7 decimals", () => {
    expect(toBlendAmount(0.123456789)).toBe(BigInt(1_234_568)); // 8th digit rounds up
  });

  it("rejects negative / non-finite values", () => {
    expect(() => toBlendAmount(-1)).toThrow();
    expect(() => toBlendAmount(NaN)).toThrow();
    expect(() => toBlendAmount(Infinity)).toThrow();
  });

  it("round-trips through fromBlendAmount", () => {
    expect(fromBlendAmount(toBlendAmount(250))).toBeCloseTo(250, 7);
    expect(fromBlendAmount(toBlendAmount(0.1))).toBeCloseTo(0.1, 7);
    expect(fromBlendAmount(BigInt(2_500_000_000))).toBeCloseTo(250, 7);
  });
});
