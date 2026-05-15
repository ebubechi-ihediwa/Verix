import { describe, expect, it } from "vitest";
import {
  DEMO_EXPECTED_FLOW,
  DEMO_GOLDEN_PROMPT,
  DEMO_SPECIALISTS,
  DEMO_SPEND_CAP_USDC,
} from "@/lib/demo-scenario";

describe("golden-path demo scenario", () => {
  it("has a prompt and enough budget for the seeded specialists", () => {
    const total = DEMO_SPECIALISTS.reduce((sum, specialist) => sum + specialist.priceUsdc, 0);
    expect(DEMO_GOLDEN_PROMPT).toContain("Soroban escrow");
    expect(total).toBeLessThanOrEqual(DEMO_SPEND_CAP_USDC);
  });

  it("documents the full escrow-backed marketplace story", () => {
    expect(DEMO_EXPECTED_FLOW.join(" ")).toContain("approves");
    expect(DEMO_EXPECTED_FLOW.join(" ")).toContain("Viewer links");
  });
});
