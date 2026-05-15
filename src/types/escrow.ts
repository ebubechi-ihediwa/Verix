// Escrow types for Trustless Work integration (EPIC 4)

export type EscrowStatus =
  | "pending"      // created locally, not yet on-chain
  | "funded"       // escrow funded on-chain
  | "in_progress"  // work underway
  | "completed"    // all milestones released
  | "cancelled"    // refunded / cancelled
  | "disputed";    // under dispute

export type MilestoneStatus =
  | "pending"      // created, not yet funded
  | "funded"       // escrow funded, waiting for work
  | "in_progress"  // work submitted, pending proof
  | "released"     // payment released to specialist
  | "refunded"     // funds returned
  | "failed";      // release attempt failed

export type ReleaseCondition =
  | "proof_verified"   // requires ExecutionReceipt.status === "verified"
  | "receipt_ready"    // requires ExecutionReceipt to exist (proof_ready or verified)
  | "manual"           // coordinator manually triggers release (demo fallback)
  | "auto";            // released immediately after specialist completes (demo mode)

// ── Core escrow models ────────────────────────────────────────────────────────

export interface Escrow {
  id: string;
  taskId: string;
  externalId?: string;       // Trustless Work escrow ID
  status: EscrowStatus;
  totalAmount: number;       // USDC, sum of all milestones
  currency: string;          // "USDC"
  payerAddress: string;      // coordinator wallet
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EscrowMilestone {
  id: string;
  escrowId: string;
  subtaskId?: string;        // links back to Subtask
  specialistId: string;
  recipientAddress: string;  // specialist wallet
  amount: number;            // USDC
  status: MilestoneStatus;
  releaseCondition: ReleaseCondition;
  agentVersionId?: string;
  agentVersionHash?: string;
  receiptId?: string;        // ExecutionReceipt.id when available
  releaseTxHash?: string;    // on-chain tx when released
  externalMilestoneId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ── Provider interface ────────────────────────────────────────────────────────

export interface CreateEscrowInput {
  taskId: string;
  payerAddress: string;
  totalAmount: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateEscrowResult {
  externalId: string;
  status: EscrowStatus;
  txHash?: string;
}

export interface FundEscrowInput {
  escrowId: string;
  externalId: string;
  amount: number;
}

export interface FundEscrowResult {
  status: EscrowStatus;
  txHash?: string;
}

export interface ReleaseMilestoneInput {
  escrowId: string;
  milestoneId: string;
  externalMilestoneId?: string;
  receiptHash?: string;
}

export interface ReleaseMilestoneResult {
  status: MilestoneStatus;
  txHash?: string;
  releasedAt?: string;
}

export interface GetEscrowResult {
  externalId: string;
  status: EscrowStatus;
  totalAmount: number;
  milestones?: Array<{
    externalMilestoneId: string;
    status: MilestoneStatus;
    amount: number;
  }>;
}

// ── EscrowProvider interface — implemented by DemoEscrowAdapter and TrustlessWorkAdapter ──

export interface EscrowProvider {
  createEscrow(input: CreateEscrowInput): Promise<CreateEscrowResult>;
  fundEscrow(input: FundEscrowInput): Promise<FundEscrowResult>;
  getEscrow(externalId: string): Promise<GetEscrowResult>;
  releaseMilestone(input: ReleaseMilestoneInput): Promise<ReleaseMilestoneResult>;
  cancelEscrow?(externalId: string): Promise<void>;
}
