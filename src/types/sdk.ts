/**
 * Public SDK gateway (/api/v1) request/response contracts.
 *
 * The public vocabulary is "Agent". Internally these map onto project-scoped
 * `Specialist` rows (see lib/v1-agents.ts) — the DB model is not renamed.
 */

// ── Agents ───────────────────────────────────────────────────────────────────

/** Arbitrary developer-supplied agent settings (slippage bounds, protocols, …). */
export type AgentConfig = Record<string, unknown>;

export interface CreateAgentRequest {
  /** Developer-facing display name. Unique per project (not globally). */
  name: string;
  /** e.g. "blend_yield" | "soroswap_trading" | custom. Null/omitted = LLM agent. */
  agentType?: string | null;
  description?: string;
  /** Stellar G... payout address. */
  walletAddress?: string;
  /** Price per execution, USDC. */
  price?: number;
  capabilities?: string[];
  config?: AgentConfig;
  /** AI model id; defaults to the project provider's default. */
  aiModel?: string;
  /** "trace-only" | "receipt-proof" | "escrow-eligible". */
  proofPolicy?: string;
}

/** All fields optional; only provided fields are updated. `name` cannot be cleared. */
export type UpdateAgentRequest = Partial<CreateAgentRequest>;

export interface AgentResponse {
  id: string;
  projectId: string;
  name: string;
  agentType: string | null;
  description: string;
  walletAddress: string;
  price: number;
  capabilities: string[];
  config: AgentConfig;
  aiModel: string | null;
  proofPolicy: string;
  status: string;
  createdAt: string;
}

export interface AgentListResponse {
  agents: AgentResponse[];
}

// ── Executions ─────────────────────────────────────────────────────────────────

/** Submit a mandate for project-scoped execution. `description` or `mandate` required. */
export interface CreateExecutionRequest {
  agentId: string;
  description?: string;
  mandate?: string;
  config?: AgentConfig;
  spendCap?: number;
  walletAddress?: string;
}

export interface CreateExecutionResponse {
  id: string;
  status: string;
  agentId: string;
  jobId: string;
  createdAt: string;
}

export interface ExecutionListItem {
  id: string;
  description: string;
  status: string;
  agentId: string | null;
  totalCost: number | null;
  spendCap: number | null;
  createdAt: string;
  completedAt: string | null;
  receiptHash: string | null;
}

export interface ExecutionListResponse {
  executions: ExecutionListItem[];
}

export interface ExecutionDetail extends ExecutionListItem {
  result: unknown;
  agent: { id: string; name: string } | null;
  trace: { root: string; eventCount: number } | null;
  receipt: {
    receiptHash: string;
    traceRoot: string;
    totalCost: number | null;
    spendCap: number | null;
    status: string;
    createdAt: string;
  } | null;
}

// ── Receipts / verification ─────────────────────────────────────────────────

// ── Console (cookie-authed, owner-scoped read models) ────────────────────────

/** One row in the console Receipts tab. */
export interface ConsoleExecutionRow {
  id: string;
  status: string;
  /** Public agent name (config.name) — never the vx_agent_ sentinel. */
  agentName: string | null;
  receiptHash: string | null;
  proofStatus: string | null;
  /** Soroban anchor: "anchored" | "pending" | "failed" | null (no receipt yet). */
  anchorStatus: string | null;
  anchorTxHash: string | null;
  createdAt: string;
}

/** The 5 verifier constraints, null when no journal is available yet. */
export interface VerificationConstraints {
  receiptIntegrity: boolean;
  spendCap: boolean;
  paymentCorrect: boolean;
  agentMembership: boolean;
  traceCommitment: boolean;
}

/** One row in the console Verifications tab. */
export interface ConsoleVerificationRow {
  taskId: string;
  receiptHash: string | null;
  status: string;
  verifiedAt: string | null;
  constraints: VerificationConstraints | null;
  /** Soroban anchor state + timestamp. */
  anchorStatus: string | null;
  anchoredAt: string | null;
  createdAt: string;
}

export interface ReceiptVerifyResponse {
  receiptHash: string;
  verified: boolean;
  proof: {
    id: string;
    status: string;
    schemaVersion: string;
    journal: unknown;
    verifiedAt: string | null;
    error: string | null;
  } | null;
}

/** Soroban anchor state for a receipt (mirrors services/receipt-anchor AnchorView). */
export interface AnchorView {
  status: "pending" | "anchored" | "failed";
  txHash: string | null;
  contractId: string | null;
  anchoredAt: string | null;
  explorerUrl: string | null;
}

/** Full response of GET /api/v1/receipts/:hash — receipt + proof + Soroban anchor. */
export interface ReceiptGetResponse {
  receiptHash: string;
  receipt: {
    receiptHash: string;
    taskId: string;
    traceRoot: string;
    taskInputHash: string;
    agentVersionHashes: string[];
    spendCap: number | null;
    totalCost: number | null;
    registrySnapshotHash: string | null;
    status: string;
    createdAt: string;
  };
  proof: {
    id: string;
    status: string;
    schemaVersion: string;
    journal: unknown;
    verifiedAt: string | null;
    error: string | null;
  } | null;
  anchor: AnchorView;
}
