import { sha256 } from "@/lib/hash";

/**
 * Blend Yield agent — STUB (Sprint 5B).
 *
 * Deterministic simulation of a Blend supply/yield operation. It performs NO
 * real contract call and broadcasts NO transaction; it produces a clearly
 * labelled stub result so the coordinator still emits genuine trace events, a
 * receipt, and a proof. Real Blend protocol integration is Sprint 5C — this
 * module is the seam that will be replaced.
 */

export interface BlendYieldStubInput {
  /** The execution mandate / task description. */
  description: string;
  /** Public agent name (already resolved from config.name — never the sentinel). */
  agentName: string;
  /** Developer-supplied agent settings (Specialist.config.settings). */
  config?: Record<string, unknown> | null;
}

export interface BlendYieldStubOperation {
  /** Always "stub" — explicit so nothing claims this is a real Blend tx. */
  mode: "stub";
  protocol: "blend";
  queriedPools: Array<{ poolId: string; asset: string; supplyApy: number }>;
  selectedPool: { poolId: string; asset: string; supplyApy: number };
  intendedSupplyAmount: number;
  asset: string;
  /** Stub transaction hash — never broadcast. Prefixed "stub-blend-". */
  txHash: string;
  note: string;
}

export interface BlendYieldStubResult {
  output: string;
  model: string;
  operation: BlendYieldStubOperation;
}

/** Fixed, deterministic pool rate table for the stub. */
const STUB_POOLS: Array<{ poolId: string; asset: string; supplyApy: number }> = [
  { poolId: "blend-pool-usdc-main", asset: "USDC", supplyApy: 5.24 },
  { poolId: "blend-pool-usdc-alt", asset: "USDC", supplyApy: 4.1 },
  { poolId: "blend-pool-xlm-main", asset: "XLM", supplyApy: 3.02 },
];

function positiveNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
}

function nonEmptyString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

/**
 * Run the deterministic Blend yield stub. Same inputs → same output (no clocks,
 * no randomness), so it is reproducible and safe to hash into a receipt.
 */
export function runBlendYieldStub(input: BlendYieldStubInput): BlendYieldStubResult {
  const cfg = input.config ?? {};
  const asset = nonEmptyString(cfg.asset, "USDC");

  const matching = STUB_POOLS.filter((p) => p.asset === asset);
  const pools = matching.length > 0 ? matching : STUB_POOLS;

  // Selection: explicit config.targetPool if valid, else the highest supply APY.
  const targetPoolId = nonEmptyString(cfg.targetPool, "");
  const byApy = [...pools].sort((a, b) => b.supplyApy - a.supplyApy);
  const selected = (targetPoolId && pools.find((p) => p.poolId === targetPoolId)) || byApy[0];

  const intendedSupplyAmount = positiveNumber(cfg.supplyAmount, 100);

  const txHash =
    "stub-blend-" +
    sha256(
      `${input.agentName}:${asset}:${selected.poolId}:${intendedSupplyAmount}:${input.description}`
    ).slice(0, 24);

  const operation: BlendYieldStubOperation = {
    mode: "stub",
    protocol: "blend",
    queriedPools: pools,
    selectedPool: selected,
    intendedSupplyAmount,
    asset,
    txHash,
    note:
      "SIMULATED Blend yield operation — no real on-chain transaction occurred. " +
      "Stub mode (Sprint 5B); real Blend protocol integration arrives in Sprint 5C.",
  };

  const output = [
    "# Blend Yield Agent — SIMULATED (stub)",
    "",
    "> ⚠️ **STUB MODE** — deterministic simulation. No real Blend contract call or on-chain transaction occurred.",
    "",
    `**Mandate:** ${input.description}`,
    "",
    "## 1. Queried pool rates",
    ...pools.map((p) => `- \`${p.poolId}\` (${p.asset}) — supply APY ${p.supplyApy.toFixed(2)}%`),
    "",
    "## 2. Selected target pool",
    `- \`${selected.poolId}\` (${selected.asset}) — supply APY ${selected.supplyApy.toFixed(2)}%`,
    "",
    "## 3. Intended supply",
    `- ${intendedSupplyAmount} ${asset} → \`${selected.poolId}\``,
    "",
    "## 4. Stub transaction",
    `- txHash: \`${txHash}\` (stub — not broadcast)`,
    "",
    `_mode: ${operation.mode} · protocol: ${operation.protocol}_`,
  ].join("\n");

  return { output, model: "blend-yield-stub", operation };
}
