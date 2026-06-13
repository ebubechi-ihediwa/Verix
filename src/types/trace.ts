export type TraceEventType =
  | "coordinator_start"
  | "selected_agent_pinned"
  | "selected_agent_unavailable"
  | "task_decomposed"
  | "spend_cap_check"
  | "spend_cap_exceeded"
  | "specialist_assigned"
  | "payment_initiated"
  | "payment_confirmed"
  | "payment_failed"
  | "specialist_invoked"
  | "delegation_requested"
  | "delegation_approved"
  | "delegation_rejected"
  | "delegation_executed"
  | "specialist_completed"
  | "specialist_failed"
  | "task_completed"
  | "result_approved"
  | "task_failed"
  // Escrow lifecycle events
  | "escrow_created"
  | "escrow_funding_pending"
  | "escrow_funded"
  | "escrow_signature_submitted"
  | "escrow_creation_failed"
  | "escrow_funding_failed"
  | "escrow_sync_failed"
  | "milestone_released"
  | "milestone_release_failed"
  // Proof lifecycle events
  | "proof_generation_started"
  | "proof_generated"
  | "proof_generation_failed"
  | "proof_verified"
  | "proof_verification_failed"
  // Blend Protocol events
  | "blend_rate_check"
  | "blend_supply_initiated"
  | "blend_supply_confirmed"
  | "blend_withdraw_initiated"
  | "blend_withdraw_confirmed"
  | "blend_rebalance_triggered"
  // Soroswap events
  | "soroswap_quote_fetched"
  | "soroswap_swap_initiated"
  | "soroswap_swap_confirmed"
  | "soroswap_price_monitored"
  // Aquarius events
  | "aquarius_pool_read"
  | "aquarius_liquidity_added"
  | "aquarius_liquidity_removed"
  | "aquarius_fees_claimed"
  | "aquarius_rebalance_triggered"
  // Stellar Anchor / payment events
  | "anchor_routes_queried"
  | "anchor_route_selected"
  | "payment_path_built"
  | "payment_submitted"
  | "payment_settled";

export interface ExecutionTraceEvent {
  id: string;
  taskId: string;
  sequence: number;
  eventType: TraceEventType;
  actor: string;
  displayMessage: string;
  inputHash?: string;
  outputHash?: string;
  eventHash: string;
  prevEventHash?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface PaymentSummaryItem {
  specialist: string;
  amount: number;
  txHash?: string;
  recipientAddress?: string;
  agentVersion?: number;
  versionHash?: string;
  subtaskId?: string;
  parentSubtaskId?: string;
  splitRole?: "primary" | "subcontractor";
  delegatedBySpecialistName?: string;
}

export interface ExecutionReceipt {
  id: string;
  taskId: string;
  taskInputHash: string;
  agentVersionHashes: string[];
  spendCap?: number;
  totalCost?: number;
  traceRoot: string;
  outputHash?: string;
  registrySnapshotHash?: string;
  anchorContractId?: string;
  anchorTxHash?: string;
  anchoredAt?: string;
  paymentSummary: PaymentSummaryItem[];
  receiptHash: string;
  status: "pending" | "proof_ready" | "verified";
  createdAt: string;
}
