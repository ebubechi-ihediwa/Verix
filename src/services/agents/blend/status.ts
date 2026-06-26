/**
 * Blend operation status is now an alias of the platform-level ExecutionStatus
 * (Sprint 7D). Kept for backwards-compatible imports within the Blend module.
 */
export type {
  ExecutionStatus as BlendOperationStatus,
} from "@/services/protocols/execution-status";
export {
  EXECUTION_STATUSES as BLEND_OPERATION_STATUSES,
  TERMINAL_EXECUTION_STATUSES as BLEND_TERMINAL_STATUSES,
  isTerminalStatus,
} from "@/services/protocols/execution-status";
