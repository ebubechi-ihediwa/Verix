import type { BlendOperationStatus } from "./status";
import type { ExecutionTimeline } from "@/services/protocols/execution-timeline";

export type BlendNetwork = "testnet" | "mainnet";

/** A vetted, allowlisted Blend pool entry (no live data). */
export interface BlendPoolEntry {
  asset: string;
  poolId: string;
  name: string;
  /** Stellar Asset Contract (SAC) id for the reserve asset — needed to build supply tx. */
  assetContractId?: string;
}

/** Reserve snapshot for a pool (units in the pool asset). */
export interface BlendReserveData {
  totalSupply: number;
  totalBorrow: number;
  availableLiquidity: number;
}

/** A discovered Blend pool with live (or mock-fallback) market data. */
export interface BlendPool {
  poolId: string;
  asset: string;
  name: string;
  /** Supply APY as a fraction, e.g. 0.0524 = 5.24%. */
  apy: number;
  /** Total supplied liquidity in the pool asset. */
  liquidity: number;
  /** Utilization ratio 0..1. */
  utilization: number;
  reserve: BlendReserveData;
  /** Where the data came from — "live" (Blend API) or "mock" (fallback). */
  source: "live" | "mock";
  fetchedAt: string;
}

export interface SelectPoolInput {
  asset: string;
  /** Minimum acceptable supply APY (fraction). */
  minApy?: number;
}

/** The chosen pool (selection output). */
export interface SelectedPool {
  poolId: string;
  asset: string;
  apy: number;
  liquidity: number;
}

export type PoolSelectionFailure =
  | "unsupported_asset"
  | "no_pools_available"
  | "apy_below_minimum";

/** Result of selectBestPool — either a winner or a structured reason. */
export interface PoolSelectionResult {
  selected: SelectedPool | null;
  reason?: PoolSelectionFailure;
  /** The best candidate considered, even if it failed the minApy gate. */
  bestConsidered?: SelectedPool;
}

/** Agent settings parsed from Specialist.config.settings. */
export interface BlendAgentSettings {
  asset: string;
  minApy?: number;
  /** Supply requires a number; withdraw also accepts "max" (full position). */
  amount?: number | "max";
  operation?: "supply" | "withdraw";
}

/** Context passed into runBlendDiscovery from the coordinator. */
export interface BlendDiscoveryContext {
  taskId: string;
  subtaskId: string;
  /** Public agent name (config.name) — never the vx_agent_ sentinel. */
  agentName: string;
  /** Raw developer settings (Specialist.config / config.settings). */
  config: Record<string, unknown> | null;
  network?: BlendNetwork;
}

export interface BlendDiscoveryResult {
  pools: BlendPool[];
  selected: SelectedPool;
  /** Markdown deliverable describing discovery + selection (stub, no tx in 7A). */
  output: string;
  model: string;
}

/** Receipt/display metadata for a completed Blend operation (additive, not hashed). */
export interface BlendOperationData {
  protocol: "blend";
  operation: "supply" | "withdraw";
  asset: string;
  amount: number;
  poolId: string;
  txHash: string;
  apy: number;
  /** Per-phase execution timestamps (additive). */
  timeline?: ExecutionTimeline;
}

/** A user's position in a Blend pool (units in the pool asset). */
export interface BlendPosition {
  deposited: number;
  borrow: number;
  withdrawable: number;
}

/**
 * Unified input to the shared operation engine. The engine discovers + selects
 * the pool itself; callers supply the parsed agent settings + execution context.
 */
export interface BlendExecuteInput {
  taskId: string;
  subtaskId: string;
  /** Public agent name (config.name). */
  agentName: string;
  asset: string;
  /** Supply: a number. Withdraw: a number or "max" (full position). */
  amount: number | "max";
  /** Discovery APY floor (supply). */
  minApy?: number;
  /** Effective spend cap. Enforced for supply; ignored for withdraw. */
  spendCap: number;
  network: BlendNetwork;
  /** Source wallet (required in wallet mode; defaults to the server signer). */
  sourceWallet?: string;
}

export interface BlendOperationResult {
  status: BlendOperationStatus;
  /** Present once a tx has been submitted (CONFIRMED). */
  txHash?: string;
  /** Present when status === "AWAITING_SIGNATURE" (wallet mode). */
  unsignedXdr?: string;
  /** Resume context when AWAITING_SIGNATURE — what the caller must persist to resume. */
  awaiting?: { poolId: string; amount: number; apy: number; sourceWallet: string };
  /** Present once confirmed. */
  operation?: BlendOperationData;
  output: string;
  /** Per-phase execution timestamps. */
  timeline: ExecutionTimeline;
}

/** Resume a wallet-mode Blend operation once the user has signed the XDR. */
export interface BlendResumeInput {
  taskId: string;
  subtaskId: string;
  agentName: string;
  operation: "supply" | "withdraw";
  asset: string;
  network: BlendNetwork;
  signedXdr: string;
  poolId: string;
  amount: number;
  apy: number;
}
