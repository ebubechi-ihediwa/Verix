import type { ExecutionTraceEvent, ExecutionReceipt } from "@/types/trace";

export type TaskStatus =
  | "pending"
  | "funding_pending"
  | "decomposing"
  | "discovering"
  | "processing"
  | "completed"
  | "failed";

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  totalCost?: number;
  result?: TaskResult;
  subtasks?: Subtask[];
  events?: TaskEvent[];
  traceEvents?: ExecutionTraceEvent[];
  receipt?: ExecutionReceipt;
  spendCap?: number;
  walletAddress?: string;
  requestedSpecialistId?: string;
  requestedSpecialistName?: string;
  requestedAgentVersionId?: string;
  requestedAgentVersionHash?: string;
  approvalStatus?: "pending" | "approved";
  approvedAt?: string;
  approvedByWallet?: string;
  approvalResultHash?: string;
  ownerId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface Subtask {
  id: string;
  capability: string;
  specialistId?: string;
  specialistName?: string;
  status: TaskStatus;
  cost?: number;
  result?: string;
  agentVersionId?: string;
  agentVersion?: number;
  versionHash?: string;
  parentSubtaskId?: string;
  delegatedBySpecialistName?: string;
  delegationDepth?: number;
}

export interface TaskResult {
  summary: string;
  deliverables: Deliverable[];
  paymentBreakdown: PaymentItem[];
  totalCost: number;
  totalTime: number;
}

export interface Deliverable {
  title: string;
  content: string;
  specialistName: string;
}

export interface PaymentItem {
  specialist: string;
  amount: number;
  txHash: string;
  blockNumber?: number;
  from?: string;
  to?: string;
  status: "pending" | "confirmed" | "failed";
  agentVersion?: number;
  versionHash?: string;
  subtaskId?: string;
  parentSubtaskId?: string;
  splitRole?: "primary" | "subcontractor";
  delegatedBySpecialistName?: string;
}

export interface TaskEvent {
  type: "coordinator" | "specialist" | "payment" | "system";
  message: string;
  status: "info" | "success" | "error" | "pending";
  timestamp: string;
}

export interface CreateTaskRequest {
  description: string;
  spendCap?: number;
  walletAddress: string;
  walletProvider?: string;
  requestedSpecialistId?: string;
}

export interface CreateTaskResponse {
  task_id: string;
  job_id: string;
  estimated_cost: number;
  subtasks: string[];
}
