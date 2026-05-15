/**
 * AgentExecutionEnvelope — a deterministic record of a single specialist invocation.
 *
 * Captures everything needed to replay or verify the execution: which agent ran,
 * what version, which model, what it received (inputHash), and what it produced (outputHash).
 * The promptHash ties the envelope to the exact prompt text sent to the model.
 */
export interface AgentExecutionEnvelope {
  subtaskId: string;
  specialistName: string;
  agentVersionId: string | undefined;
  agentVersionHash: string | undefined;
  model: string;
  provider: "claude" | "openai" | "fallback";
  promptHash: string;
  inputHash: string;
  outputHash: string;
  completedAt: string;
}
