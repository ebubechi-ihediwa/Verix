import { inspectTransaction, replayTransaction } from "@/services/agents/blend";
import { requireProtocolAdapter, listProtocols } from "./registry";
import type { ProtocolDiagnostics } from "./types";

/**
 * Live validation tools (Sprint 7D): transaction inspection, transaction replay
 * (re-simulate without submitting), and protocol diagnostics (readiness checks).
 * Read-only — never submit a transaction.
 */

/** Inspect a submitted transaction's on-chain state. */
export async function inspectTx(txHash: string): Promise<{
  status: string;
  ledger?: number;
  resultXdr?: string;
}> {
  return inspectTransaction(txHash);
}

/** Re-simulate an unsigned transaction XDR to preview success/failure. */
export async function replayTx(unsignedXdr: string): Promise<{ ok: boolean; detail: string }> {
  return replayTransaction(unsignedXdr);
}

/** Run readiness diagnostics for one protocol. */
export async function diagnoseProtocol(protocol: string): Promise<ProtocolDiagnostics> {
  return requireProtocolAdapter(protocol).diagnose();
}

/** Run readiness diagnostics for every registered protocol. */
export async function diagnoseAll(): Promise<ProtocolDiagnostics[]> {
  return Promise.all(listProtocols().map((p) => requireProtocolAdapter(p).diagnose()));
}
