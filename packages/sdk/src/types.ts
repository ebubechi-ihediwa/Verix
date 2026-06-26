/**
 * Public contracts for the Verix SDK.
 *
 * These are re-exported from the Verix app's `/api/v1` contract module
 * (src/types/sdk.ts) — the single source of truth. Nothing is duplicated here.
 * When the package is bundled for publishing, the declaration bundler inlines
 * these so the published `.d.ts` has no external references.
 */
export type {
  AgentConfig,
  CreateAgentRequest,
  UpdateAgentRequest,
  AgentResponse,
  AgentListResponse,
  CreateExecutionRequest,
  CreateExecutionResponse,
  ExecutionListItem,
  ExecutionListResponse,
  ExecutionDetail,
  ExecutionSignatureState,
  ResumeExecutionResponse,
  ReceiptVerifyResponse,
  VerificationConstraints,
  AnchorView,
  ReceiptGetResponse,
} from "../../../src/types/sdk";
