import { describe, it, expect } from "vitest";
import {
  canTransition,
  isTerminalStatus,
  EXECUTION_STATUSES,
} from "@/services/protocols/execution-status";

describe("platform execution state machine", () => {
  it("defines all 10 platform states incl. AWAITING_SIGNATURE + RETRYING", () => {
    expect(EXECUTION_STATUSES).toHaveLength(10);
    expect(EXECUTION_STATUSES).toContain("AWAITING_SIGNATURE");
    expect(EXECUTION_STATUSES).toContain("RETRYING");
  });

  it("allows the forward path", () => {
    expect(canTransition("PENDING", "DISCOVERING")).toBe(true);
    expect(canTransition("DISCOVERING", "BUILDING")).toBe(true);
    expect(canTransition("BUILDING", "AWAITING_SIGNATURE")).toBe(true);
    expect(canTransition("BUILDING", "SIGNING")).toBe(true);
    expect(canTransition("AWAITING_SIGNATURE", "SUBMITTING")).toBe(true);
    expect(canTransition("SUBMITTING", "CONFIRMING")).toBe(true);
    expect(canTransition("CONFIRMING", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMING", "RETRYING")).toBe(true);
    expect(canTransition("RETRYING", "SUBMITTING")).toBe(true);
  });

  it("allows FAILED from any active state", () => {
    expect(canTransition("DISCOVERING", "FAILED")).toBe(true);
    expect(canTransition("SIGNING", "FAILED")).toBe(true);
    expect(canTransition("CONFIRMING", "FAILED")).toBe(true);
  });

  it("rejects illegal jumps and transitions out of terminal states", () => {
    expect(canTransition("PENDING", "CONFIRMED")).toBe(false);
    expect(canTransition("BUILDING", "CONFIRMED")).toBe(false);
    expect(canTransition("CONFIRMED", "SUBMITTING")).toBe(false);
    expect(canTransition("FAILED", "CONFIRMED")).toBe(false);
  });

  it("marks terminal states", () => {
    expect(isTerminalStatus("CONFIRMED")).toBe(true);
    expect(isTerminalStatus("FAILED")).toBe(true);
    expect(isTerminalStatus("SUBMITTING")).toBe(false);
    expect(isTerminalStatus("AWAITING_SIGNATURE")).toBe(false);
  });
});
