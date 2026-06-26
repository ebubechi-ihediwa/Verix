import type { ExecutionStatus } from "./execution-status";
import type { ExecutionTimeline } from "./execution-timeline";

/** How a protocol's transactions are signed. */
export type SigningMode = "server" | "wallet";

export type ProtocolNetwork = "testnet" | "mainnet";

export interface ProtocolExecuteRequest {
  taskId: string;
  subtaskId: string;
  agentName: string;
  /** e.g. "supply" | "withdraw". */
  operation: string;
  asset: string;
  amount: number | "max";
  minApy?: number;
  spendCap: number;
  network: ProtocolNetwork;
  /** Source wallet (required in wallet mode; defaults to the server signer otherwise). */
  sourceWallet?: string;
}

/** Display metadata for a completed protocol operation (additive, not hashed). */
export interface ProtocolOperationData {
  protocol: string;
  operation: string;
  asset: string;
  amount: number;
  poolId: string;
  txHash: string;
  apy: number;
  timeline?: ExecutionTimeline;
}

export interface ProtocolExecuteResult {
  status: ExecutionStatus;
  txHash?: string;
  /** Present when status === "AWAITING_SIGNATURE" (wallet mode). */
  unsignedXdr?: string;
  operation?: ProtocolOperationData;
  output: string;
  timeline: ExecutionTimeline;
}

/** Resume a wallet-mode execution once the user has signed the XDR. */
export interface ProtocolResumeRequest {
  taskId: string;
  subtaskId: string;
  agentName: string;
  operation: string;
  asset: string;
  network: ProtocolNetwork;
  signedXdr: string;
  poolId: string;
  amount: number;
  apy: number;
}

export interface ProtocolDiagnosticCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface ProtocolDiagnostics {
  protocol: string;
  network: ProtocolNetwork;
  signingMode: SigningMode;
  ready: boolean;
  checks: ProtocolDiagnosticCheck[];
}

/**
 * Reusable protocol adapter. Each protocol (Blend today) implements this so the
 * platform can execute/resume/diagnose uniformly. Adding a protocol = a new
 * adapter + registry entry; no public API changes.
 */
export interface ProtocolAdapter {
  readonly protocol: string;
  readonly operations: readonly string[];
  supports(operation: string): boolean;
  execute(req: ProtocolExecuteRequest): Promise<ProtocolExecuteResult>;
  resume(req: ProtocolResumeRequest): Promise<ProtocolExecuteResult>;
  diagnose(): Promise<ProtocolDiagnostics>;
}
