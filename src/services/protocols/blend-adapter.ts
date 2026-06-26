import {
  executeBlendSupply,
  executeBlendWithdraw,
  resumeBlendOperation,
  resolveSigningMode,
  resolveBlendNetwork,
  getPoolAllowlist,
  getAssetContractId,
} from "@/services/agents/blend";
import { env } from "@/lib/env";
import type {
  ProtocolAdapter,
  ProtocolDiagnostics,
  ProtocolExecuteRequest,
  ProtocolExecuteResult,
  ProtocolResumeRequest,
} from "./types";

/**
 * Blend behind the reusable ProtocolAdapter interface (Sprint 7D). It delegates
 * to the existing Blend operation engine (no public API change) so the platform
 * can execute/resume/diagnose Blend the same way it would any future protocol.
 */
class BlendProtocolAdapter implements ProtocolAdapter {
  readonly protocol = "blend";
  readonly operations = ["supply", "withdraw"] as const;

  supports(operation: string): boolean {
    return (this.operations as readonly string[]).includes(operation);
  }

  async execute(req: ProtocolExecuteRequest): Promise<ProtocolExecuteResult> {
    const input = {
      taskId: req.taskId,
      subtaskId: req.subtaskId,
      agentName: req.agentName,
      asset: req.asset,
      amount: req.amount,
      minApy: req.minApy,
      spendCap: req.spendCap,
      network: req.network,
      sourceWallet: req.sourceWallet,
    };
    const result =
      req.operation === "withdraw"
        ? await executeBlendWithdraw(input)
        : await executeBlendSupply(input);
    return {
      status: result.status,
      txHash: result.txHash,
      unsignedXdr: result.unsignedXdr,
      operation: result.operation,
      output: result.output,
      timeline: result.timeline,
    };
  }

  async resume(req: ProtocolResumeRequest): Promise<ProtocolExecuteResult> {
    if (req.operation !== "supply" && req.operation !== "withdraw") {
      throw new Error(`Unsupported Blend operation: ${req.operation}`);
    }
    const result = await resumeBlendOperation({
      taskId: req.taskId,
      subtaskId: req.subtaskId,
      agentName: req.agentName,
      operation: req.operation,
      asset: req.asset,
      network: req.network,
      signedXdr: req.signedXdr,
      poolId: req.poolId,
      amount: req.amount,
      apy: req.apy,
    });
    return {
      status: result.status,
      txHash: result.txHash,
      operation: result.operation,
      output: result.output,
      timeline: result.timeline,
    };
  }

  async diagnose(): Promise<ProtocolDiagnostics> {
    const network = resolveBlendNetwork();
    const signingMode = resolveSigningMode();
    const allowlist = getPoolAllowlist(network);
    const usdcSac = getAssetContractId("USDC", network);

    const checks = [
      { name: "rpc_configured", ok: Boolean(env.SOROBAN_RPC_URL), detail: env.SOROBAN_RPC_URL },
      { name: "pool_allowlist", ok: allowlist.length > 0, detail: `${allowlist.length} pool(s)` },
      { name: "asset_contract_id", ok: Boolean(usdcSac), detail: usdcSac ? "configured" : "missing (set BLEND_POOLS)" },
      signingMode === "server"
        ? { name: "server_signer", ok: Boolean(env.COORDINATOR_STELLAR_PRIVATE_KEY), detail: env.COORDINATOR_STELLAR_PRIVATE_KEY ? "present" : "missing" }
        : { name: "wallet_mode", ok: true, detail: "user-signed (no server custody)" },
      { name: "mainnet_signing", ok: !(network === "mainnet" && signingMode === "server"), detail: network === "mainnet" && signingMode === "server" ? "server signing not allowed on mainnet" : "ok" },
    ];

    return { protocol: this.protocol, network, signingMode, ready: checks.every((c) => c.ok), checks };
  }
}

export const blendAdapter: ProtocolAdapter = new BlendProtocolAdapter();
