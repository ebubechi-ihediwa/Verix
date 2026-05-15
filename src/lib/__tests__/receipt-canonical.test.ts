import { describe, expect, it } from "vitest";
import { hashReceiptCommitment } from "@/lib/receipt-canonical";
import { buildProofInput, verify } from "../../../proofs/verifier";

const VALID_TRACE_ROOT = "a".repeat(64);
const VALID_OUTPUT_HASH = "b".repeat(64);
const VERSION_HASH = "c".repeat(64);
const REGISTRY_HASH = "d".repeat(64);
const RECIPIENT = "G" + "A".repeat(55);

describe("receipt canonicalization", () => {
  it("uses the same canonical payload for receipts and proof verification", () => {
    const receiptHash = hashReceiptCommitment({
      taskId: "task-1",
      taskInputHash: "input-hash",
      agentVersionHashes: [VERSION_HASH],
      spendCap: 5,
      totalCost: 1.25,
      traceRoot: VALID_TRACE_ROOT,
      outputHash: VALID_OUTPUT_HASH,
      registrySnapshotHash: REGISTRY_HASH,
      paymentSummary: [
        {
          specialist: "CodeAuditor",
          amount: 1.25,
          txHash: "0xabc",
          recipientAddress: RECIPIENT,
          agentVersion: 2,
          versionHash: VERSION_HASH,
        },
      ],
    });

    const proofInput = buildProofInput({
      taskId: "task-1",
      taskInputHash: "input-hash",
      receiptHash,
      traceRoot: VALID_TRACE_ROOT,
      agentVersionHashes: [VERSION_HASH],
      spendCap: 5,
      totalCost: 1.25,
      outputHash: VALID_OUTPUT_HASH,
      registrySnapshotHash: REGISTRY_HASH,
      paymentIntents: [
        {
          specialist: "CodeAuditor",
          amount: 1.25,
          txHash: "0xabc",
          recipientAddress: RECIPIENT,
          agentVersion: 2,
          versionHash: VERSION_HASH,
        },
      ],
    });

    const result = verify(proofInput);

    expect(result.ok).toBe(true);
    expect(result.journal.receiptIntegrityOk).toBe(true);
  });

  it("fails receipt integrity when registry snapshot commitment changes", () => {
    const receiptHash = hashReceiptCommitment({
      taskId: "task-1",
      taskInputHash: "input-hash",
      agentVersionHashes: [VERSION_HASH],
      spendCap: 5,
      totalCost: 1.25,
      traceRoot: VALID_TRACE_ROOT,
      outputHash: VALID_OUTPUT_HASH,
      registrySnapshotHash: REGISTRY_HASH,
      paymentSummary: [
        {
          specialist: "CodeAuditor",
          amount: 1.25,
          txHash: "0xabc",
          recipientAddress: RECIPIENT,
          agentVersion: 2,
          versionHash: VERSION_HASH,
        },
      ],
    });

    const result = verify(buildProofInput({
      taskId: "task-1",
      taskInputHash: "input-hash",
      receiptHash,
      traceRoot: VALID_TRACE_ROOT,
      agentVersionHashes: [VERSION_HASH],
      spendCap: 5,
      totalCost: 1.25,
      outputHash: VALID_OUTPUT_HASH,
      registrySnapshotHash: "e".repeat(64),
      paymentIntents: [
        {
          specialist: "CodeAuditor",
          amount: 1.25,
          txHash: "0xabc",
          recipientAddress: RECIPIENT,
          agentVersion: 2,
          versionHash: VERSION_HASH,
        },
      ],
    }));

    expect(result.ok).toBe(false);
    expect(result.failedConstraints).toContain("receipt_integrity");
  });
});
