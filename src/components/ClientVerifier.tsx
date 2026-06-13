"use client";

/**
 * Client-side 5-constraint verifier for Verix execution receipts.
 *
 * Runs entirely in-browser using SubtleCrypto — no server round-trip.
 * Implements the same logic as proofs/verifier.ts using the same
 * canonicalization algorithm from src/lib/hash.ts.
 */

import { useState, useCallback } from "react";
import { LoaderCircle, ShieldCheck, ShieldX } from "lucide-react";
import { ExecutionReceipt, PaymentSummaryItem } from "@/types/trace";

// ── Browser-compatible SHA-256 ────────────────────────────────────────────────

async function sha256Browser(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const buf = await crypto.subtle.digest("SHA-256", encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value ?? null);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + (value as unknown[]).map(canonicalize).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`
  );
  return "{" + pairs.join(",") + "}";
}

async function hashCanonicalBrowser(obj: Record<string, unknown>): Promise<string> {
  return sha256Browser(canonicalize(obj));
}

function buildCommitmentPayload(receipt: ExecutionReceipt): Record<string, unknown> {
  const paymentSummary = (receipt.paymentSummary ?? []).map((p: PaymentSummaryItem) => ({
    specialist: p.specialist,
    amount: p.amount,
    txHash: p.txHash,
    recipientAddress: p.recipientAddress,
    agentVersion: p.agentVersion,
    versionHash: p.versionHash,
    subtaskId: p.subtaskId,
    parentSubtaskId: p.parentSubtaskId,
    splitRole: p.splitRole,
    delegatedBySpecialistName: p.delegatedBySpecialistName,
  }));

  return {
    taskId: receipt.taskId,
    taskInputHash: receipt.taskInputHash,
    agentVersionHashes: [...(receipt.agentVersionHashes ?? [])].sort(),
    spendCap: receipt.spendCap ?? null,
    totalCost: receipt.totalCost ?? null,
    traceRoot: receipt.traceRoot,
    outputHash: receipt.outputHash ?? null,
    registrySnapshotHash: receipt.registrySnapshotHash ?? null,
    paymentSummary,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConstraintResult {
  id: string;
  label: string;
  description: string;
  pass: boolean | null;
  detail?: string;
}

interface VerificationResult {
  pass: boolean;
  constraints: ConstraintResult[];
  computedReceiptHash: string;
}

// ── Core verification ─────────────────────────────────────────────────────────

async function runClientVerification(receipt: ExecutionReceipt): Promise<VerificationResult> {
  const constraints: ConstraintResult[] = [];

  // 1. Receipt integrity
  const payload = buildCommitmentPayload(receipt);
  const computedHash = await hashCanonicalBrowser(payload);
  const integrityPass = computedHash === receipt.receiptHash;
  constraints.push({
    id: "receipt_integrity",
    label: "Receipt integrity",
    description: "Recomputed SHA-256 matches committed receiptHash",
    pass: integrityPass,
    detail: integrityPass
      ? `✓ ${computedHash.slice(0, 16)}…`
      : `Computed ${computedHash.slice(0, 16)}… ≠ ${(receipt.receiptHash ?? "").slice(0, 16)}…`,
  });

  // 2. Spend cap compliance
  const totalCost = receipt.totalCost ?? 0;
  const spendCap = receipt.spendCap;
  const capPass = spendCap == null || totalCost <= spendCap;
  constraints.push({
    id: "spend_cap",
    label: "Spend cap compliance",
    description: "totalCost ≤ user-defined spend cap",
    pass: capPass,
    detail: spendCap != null
      ? `$${totalCost.toFixed(4)} / $${spendCap.toFixed(4)} USDC`
      : "No cap set",
  });

  // 3. Payment correctness
  const payments = receipt.paymentSummary ?? [];
  const sumPayments = payments.reduce((acc, p) => acc + (p.amount ?? 0), 0);
  const paymentTolerance = 0.001;
  const paymentPass =
    payments.length === 0 ||
    Math.abs(sumPayments - totalCost) <= paymentTolerance;
  constraints.push({
    id: "payment_correctness",
    label: "Payment correctness",
    description: "∑payment intents = totalCost",
    pass: paymentPass,
    detail: `${payments.length} payment(s) · sum $${sumPayments.toFixed(4)} vs $${totalCost.toFixed(4)}`,
  });

  // 4. Agent membership
  const agents = receipt.agentVersionHashes ?? [];
  const agentPass = agents.length > 0 && agents.every((h) => typeof h === "string" && h.length > 0);
  constraints.push({
    id: "agent_membership",
    label: "Agent membership",
    description: "agentVersionHashes non-empty; all entries are valid strings",
    pass: agentPass,
    detail: `${agents.length} agent(s) registered`,
  });

  // 5. Trace commitment
  const traceRoot = receipt.traceRoot ?? "";
  const tracePass = typeof traceRoot === "string" && traceRoot.length === 64 && /^[0-9a-f]+$/.test(traceRoot);
  constraints.push({
    id: "trace_commitment",
    label: "Trace commitment",
    description: "traceRoot is a valid 64-char lowercase hex SHA-256",
    pass: tracePass,
    detail: traceRoot.length > 0 ? `${traceRoot.slice(0, 16)}… (${traceRoot.length} chars)` : "Empty",
  });

  const pass = constraints.every((c) => c.pass === true);
  return { pass, constraints, computedReceiptHash: computedHash };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  receipt: ExecutionReceipt;
}

export default function ClientVerifier({ receipt }: Props) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);

  const runVerification = useCallback(async () => {
    setRunning(true);
    setResult(null);
    try {
      const r = await runClientVerification(receipt);
      setResult(r);
    } finally {
      setRunning(false);
    }
  }, [receipt]);

  return (
    <div className="verix-panel">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <p className="verix-label mb-1">5-constraint verifier</p>
          <h3 className="text-sm font-semibold text-ink">In-browser verification</h3>
          <p className="text-xs text-ink-muted mt-0.5">
            Runs entirely client-side using SubtleCrypto — no server involved.
          </p>
        </div>
        {result && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
            result.pass
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            {result.pass ? <ShieldCheck size={13} /> : <ShieldX size={13} />}
            {result.pass ? "All passed" : "Failed"}
          </div>
        )}
      </div>

      {result ? (
        <div className="space-y-0 border border-border rounded-md overflow-hidden mb-4">
          {result.constraints.map((c) => (
            <div
              key={c.id}
              className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 bg-surface"
            >
              <span className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold ${
                c.pass ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
              }`}>
                {c.pass ? "✓" : "✗"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-ink font-mono">{c.label}</p>
                  {c.detail && (
                    <span className="text-[10px] font-mono text-ink-muted shrink-0">{c.detail}</span>
                  )}
                </div>
                <p className="text-[11px] text-ink-muted mt-0.5">{c.description}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <button
        onClick={runVerification}
        disabled={running}
        className="verix-control w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold disabled:opacity-50"
      >
        {running ? (
          <>
            <LoaderCircle size={13} className="animate-spin" />
            Verifying…
          </>
        ) : result ? (
          "Re-verify"
        ) : (
          "Run 5-constraint verification"
        )}
      </button>
    </div>
  );
}
