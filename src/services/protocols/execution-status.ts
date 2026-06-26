/**
 * Platform-level execution state machine (Sprint 7D).
 *
 * Generalizes the protocol-specific lifecycle so any on-chain protocol execution
 * (Blend today) reports through one vocabulary. The Blend `BlendOperationStatus`
 * is an alias of this type.
 */
export type ExecutionStatus =
  | "PENDING"
  | "DISCOVERING"
  | "BUILDING"
  | "AWAITING_SIGNATURE"
  | "SIGNING"
  | "SUBMITTING"
  | "CONFIRMING"
  | "CONFIRMED"
  | "FAILED"
  | "RETRYING";

export const EXECUTION_STATUSES: ExecutionStatus[] = [
  "PENDING",
  "DISCOVERING",
  "BUILDING",
  "AWAITING_SIGNATURE",
  "SIGNING",
  "SUBMITTING",
  "CONFIRMING",
  "CONFIRMED",
  "FAILED",
  "RETRYING",
];

export const TERMINAL_EXECUTION_STATUSES: ExecutionStatus[] = ["CONFIRMED", "FAILED"];

/** Allowed forward transitions. FAILED/RETRYING are reachable from any active state. */
const TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  PENDING: ["DISCOVERING", "BUILDING", "FAILED"],
  DISCOVERING: ["BUILDING", "FAILED"],
  BUILDING: ["AWAITING_SIGNATURE", "SIGNING", "FAILED"],
  AWAITING_SIGNATURE: ["SIGNING", "SUBMITTING", "FAILED"],
  SIGNING: ["SUBMITTING", "FAILED"],
  SUBMITTING: ["CONFIRMING", "FAILED"],
  CONFIRMING: ["CONFIRMED", "FAILED", "RETRYING"],
  RETRYING: ["SUBMITTING", "CONFIRMING", "CONFIRMED", "FAILED"],
  CONFIRMED: [],
  FAILED: [],
};

export function isTerminalStatus(status: ExecutionStatus): boolean {
  return TERMINAL_EXECUTION_STATUSES.includes(status);
}

export function canTransition(from: ExecutionStatus, to: ExecutionStatus): boolean {
  if (from === to) return true;
  if (to === "FAILED" && !isTerminalStatus(from)) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}
