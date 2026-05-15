import { describe, expect, it } from "vitest";
import { isDemoEscrowId, trustlessWorkEscrowViewerUrl } from "@/lib/trustless-work";

describe("Trustless Work viewer links", () => {
  it("does not generate viewer links for demo escrow ids", () => {
    expect(isDemoEscrowId("DEMO-ESC-123")).toBe(true);
    expect(trustlessWorkEscrowViewerUrl("DEMO-ESC-123")).toBeNull();
  });

  it("generates viewer links for real escrow contract ids", () => {
    expect(trustlessWorkEscrowViewerUrl("CB123")).toBe("https://viewer.trustlesswork.com/escrow/CB123");
  });
});
