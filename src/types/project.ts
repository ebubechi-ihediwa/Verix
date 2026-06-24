export type ProjectNetwork = "testnet" | "mainnet";
export type ProjectAIProvider = "openai" | "anthropic" | "groq" | "kimi";
export type KeyEnvironment = "live" | "test";

/** Client-safe view of a project. Never includes the encrypted/raw provider key. */
export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  network: ProjectNetwork;
  aiProvider: ProjectAIProvider;
  aiApiKeyMasked: string | null;
  hasApiKey: boolean;
  webhookUrl: string | null;
  createdAt: string;
}

/** Client-safe view of a Verix API key. Never includes the raw key or its hash. */
export interface ApiKeyView {
  id: string;
  keyPrefix: string;
  last4: string;
  environment: KeyEnvironment;
  label: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

// ── Request / response contracts ─────────────────────────────────────────────

export interface CreateProjectRequest {
  name: string;
  description?: string;
  network: ProjectNetwork;
  aiProvider: ProjectAIProvider;
  aiApiKey: string;
}

export interface CreateProjectResponse {
  project: ProjectSummary;
  /** Raw vx_live_/vx_test_ key — returned ONCE, never again. */
  apiKey: { id: string; key: string; keyPrefix: string; environment: KeyEnvironment };
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  webhookUrl?: string;
}

export interface SetProviderRequest {
  aiProvider: ProjectAIProvider;
  aiApiKey: string;
}

export interface SetProviderResponse {
  aiProvider: ProjectAIProvider;
  aiApiKeyMasked: string;
}

export interface TestProviderRequest {
  /** Optional: test a supplied raw key. If omitted, tests the stored key. */
  aiProvider?: ProjectAIProvider;
  aiApiKey?: string;
}

export interface TestProviderResponse {
  ok: boolean;
  detail: string;
}

export interface CreateKeyRequest {
  label?: string;
}

export interface CreateKeyResponse {
  id: string;
  /** Raw key — returned ONCE. */
  key: string;
  keyPrefix: string;
  environment: KeyEnvironment;
}
