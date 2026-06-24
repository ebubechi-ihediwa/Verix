export type ProofPolicy = "trace-only" | "receipt-proof" | "escrow-eligible";
export type AiModelProvider = "claude" | "openai" | "groq";

export interface Specialist {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  walletAddress: string;
  capabilities: string[];
  priceUsdc: number;
  reputation: number;
  totalJobs: number;
  verifiedJobs?: number;  // receipt-backed verified completions from ReputationEvent
  status: "online" | "offline" | "busy";
  aiModel?: AiModelProvider;
  proofPolicy: ProofPolicy;
  currentVersion: number;
  apiKey?: string;        // encrypted, never sent to client
  apiKeyMasked?: string;  // "sk-abc...xyz1", safe for display
  ownerId?: string;       // session ID of registering user; null for system agents
  // ── SDK gateway (project-scoped agents) ─────────────────────────────────────
  /** AgentType, e.g. "blend_yield". null = LLM specialist. */
  agentType?: string | null;
  /** Internal DB name (the vx_agent_<hex> sentinel for SDK agents). NEVER shown. */
  internalName?: string;
  /** Developer-supplied agent settings (Specialist.config.settings). */
  config?: Record<string, unknown> | null;
}

export interface AgentVersion {
  id: string;
  specialistId: string;
  version: number;
  name: string;
  description: string;
  walletAddress: string;
  capabilities: string[];
  priceUsdc: number;
  proofPolicy: ProofPolicy;
  aiModel: string;
  versionHash: string;
  createdAt: string;
}

export interface SpecialistReputationStats {
  score: number;
  totalJobs: number;
  verifiedJobs: number;
  demoJobs: number;
  successRate: number;
}

export interface SpecialistProfile extends Omit<Specialist, "reputation"> {
  versions: AgentVersion[];
  reputation: SpecialistReputationStats;
}
