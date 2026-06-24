import { describe, it, expect } from "vitest";
import { computeVersionHash } from "@/services/discovery";
import { buildProofInput, verify } from "../../../proofs/verifier";

/**
 * Pinned SDK-agent execution must satisfy proof constraint 4 (agent membership):
 * the AgentVersion snapshot created at agent-creation gives a non-empty, public
 * versionHash, and the receipt/proof must carry the public name — never the
 * internal vx_agent_ sentinel.
 */
describe("pinned execution — proof agent membership", () => {
  const publicName = "My Yield Agent";
  const wallet = "G" + "A".repeat(55);
  const versionHash = computeVersionHash(publicName, 1, 1.5, wallet, ["blend-yield"], "trace-only", "openai");

  it("produces a non-empty, sentinel-free version hash", () => {
    expect(versionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(versionHash).not.toMatch(/vx_agent_/);
  });

  it("passes the agent_membership constraint and exposes only the public name", () => {
    const input = buildProofInput({
      taskId: "task_1",
      taskInputHash: "a".repeat(64),
      receiptHash: "b".repeat(64),
      traceRoot: "c".repeat(64),
      agentVersionHashes: [versionHash],
      spendCap: 50,
      totalCost: 1.5,
      paymentIntents: [
        { specialist: publicName, amount: 1.5, recipientAddress: wallet, versionHash },
      ],
    });

    const result = verify(input);
    expect(result.journal.agentMembershipOk).toBe(true);
    expect(result.failedConstraints).not.toContain("agent_membership");

    // nothing in the proof input exposes the internal sentinel
    expect(JSON.stringify(input)).not.toMatch(/vx_agent_/);
  });
});
