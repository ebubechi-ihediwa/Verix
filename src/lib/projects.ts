import { randomBytes } from "crypto";
import type { Project, ProjectApiKey } from "@prisma/client";
import { prisma } from "@/lib/db";
import { encrypt, decrypt, maskApiKey } from "@/lib/encryption";
import { generateApiKey } from "@/lib/api-keys";
import type {
  ApiKeyView,
  CreateKeyResponse,
  ProjectAIProvider,
  ProjectNetwork,
  ProjectSummary,
  UpdateProjectRequest,
} from "@/types/project";

export const VALID_PROVIDERS: ProjectAIProvider[] = ["openai", "anthropic", "groq", "kimi"];
export const VALID_NETWORKS: ProjectNetwork[] = ["testnet", "mainnet"];

// ── Mappers (client-safe projections) ────────────────────────────────────────

export function toProjectSummary(project: Project, hasApiKey: boolean): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    network: project.network as ProjectNetwork,
    aiProvider: project.aiProvider as ProjectAIProvider,
    aiApiKeyMasked: project.aiApiKeyMasked ?? null,
    hasApiKey,
    webhookUrl: project.webhookUrl ?? null,
    createdAt: project.createdAt.toISOString(),
  };
}

export function toApiKeyView(key: ProjectApiKey): ApiKeyView {
  return {
    id: key.id,
    keyPrefix: key.keyPrefix,
    last4: key.last4,
    environment: key.environment as ApiKeyView["environment"],
    label: key.label ?? null,
    lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
    revokedAt: key.revokedAt ? key.revokedAt.toISOString() : null,
    createdAt: key.createdAt.toISOString(),
  };
}

// ── Project CRUD ─────────────────────────────────────────────────────────────

export interface CreateProjectInput {
  userId: string;
  name: string;
  description?: string | null;
  network: ProjectNetwork;
  aiProvider: ProjectAIProvider;
  aiApiKey: string;
}

/** Create a project with an encrypted BYOK provider key and a generated webhook secret. */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  return prisma.project.create({
    data: {
      userId: input.userId,
      name: input.name,
      description: input.description ?? null,
      network: input.network,
      aiProvider: input.aiProvider,
      aiApiKeyEncrypted: encrypt(input.aiApiKey),
      aiApiKeyMasked: maskApiKey(input.aiApiKey),
      webhookSecret: `whsec_${randomBytes(24).toString("base64url")}`,
    },
  });
}

/** List a user's projects with hasApiKey computed from active keys. */
export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { apiKeys: { where: { revokedAt: null }, select: { id: true } } },
  });
  return projects.map((p) => toProjectSummary(p, p.apiKeys.length > 0));
}

/**
 * Load a project only if it is owned by `userId`. Returns null when the project
 * does not exist OR belongs to another user (no existence leak — routes 404 both).
 */
export async function getOwnedProject(id: string, userId: string): Promise<Project | null> {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.userId !== userId) return null;
  return project;
}

/** True when `userId` owns `project`. */
export function isOwner(project: Project, userId: string): boolean {
  return project.userId === userId;
}

export async function projectHasActiveKey(projectId: string): Promise<boolean> {
  const count = await prisma.projectApiKey.count({ where: { projectId, revokedAt: null } });
  return count > 0;
}

export async function updateProject(id: string, fields: UpdateProjectRequest): Promise<Project> {
  return prisma.project.update({
    where: { id },
    data: {
      ...(fields.name !== undefined ? { name: fields.name } : {}),
      ...(fields.description !== undefined ? { description: fields.description } : {}),
      ...(fields.webhookUrl !== undefined ? { webhookUrl: fields.webhookUrl } : {}),
    },
  });
}

export async function deleteProject(id: string): Promise<void> {
  await prisma.project.delete({ where: { id } });
}

/** Replace the AI provider + BYOK key (encrypted before storage). */
export async function setProvider(
  id: string,
  aiProvider: ProjectAIProvider,
  aiApiKey: string
): Promise<Project> {
  return prisma.project.update({
    where: { id },
    data: {
      aiProvider,
      aiApiKeyEncrypted: encrypt(aiApiKey),
      aiApiKeyMasked: maskApiKey(aiApiKey),
    },
  });
}

// ── Project-scoped API keys ──────────────────────────────────────────────────

/** Generate + persist a key for a project. Returns the raw key ONCE. */
export async function createProjectApiKey(
  projectId: string,
  network: ProjectNetwork,
  label?: string | null
): Promise<CreateKeyResponse> {
  const gen = generateApiKey(network);
  const row = await prisma.projectApiKey.create({
    data: {
      projectId,
      keyHash: gen.keyHash,
      keyPrefix: gen.keyPrefix,
      last4: gen.last4,
      environment: gen.environment,
      label: label ?? null,
    },
  });
  return { id: row.id, key: gen.raw, keyPrefix: gen.keyPrefix, environment: gen.environment };
}

export async function listProjectApiKeys(projectId: string): Promise<ApiKeyView[]> {
  const rows = await prisma.projectApiKey.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toApiKeyView);
}

/**
 * Revoke a key, scoped to its project. Returns false if the key does not exist
 * or belongs to a different project. Idempotent on already-revoked keys.
 */
export async function revokeProjectApiKey(projectId: string, keyId: string): Promise<boolean> {
  const key = await prisma.projectApiKey.findUnique({ where: { id: keyId } });
  if (!key || key.projectId !== projectId) return false;
  if (!key.revokedAt) {
    await prisma.projectApiKey.update({ where: { id: keyId }, data: { revokedAt: new Date() } });
  }
  return true;
}

// ── Provider connection test (read-only; never persists) ─────────────────────

const PROVIDER_TEST_ENDPOINTS: Record<ProjectAIProvider, string> = {
  openai: "https://api.openai.com/v1/models",
  groq: "https://api.groq.com/openai/v1/models",
  kimi: "https://api.moonshot.ai/v1/models",
  anthropic: "https://api.anthropic.com/v1/models",
};

/**
 * Make a lightweight, read-only call to the provider to confirm a key works.
 * Does NOT persist anything. Returns { ok, detail } and never throws.
 */
export async function testProviderKey(
  provider: ProjectAIProvider,
  rawKey: string
): Promise<{ ok: boolean; detail: string }> {
  const url = PROVIDER_TEST_ENDPOINTS[provider];
  if (!url) return { ok: false, detail: `Unknown provider: ${provider}` };
  if (!rawKey) return { ok: false, detail: "No API key to test" };

  const headers: Record<string, string> =
    provider === "anthropic"
      ? { "x-api-key": rawKey, "anthropic-version": "2023-06-01" }
      : { Authorization: `Bearer ${rawKey}` };

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
    if (res.ok) return { ok: true, detail: "Connection successful" };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, detail: "Provider rejected the API key (unauthorized)" };
    }
    return { ok: false, detail: `Provider returned HTTP ${res.status}` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, detail: `Could not reach provider: ${msg}` };
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

/** Decrypt a project's stored provider key for testing/execution. Throws if unset. */
export function decryptProviderKey(project: Project): string {
  if (!project.aiApiKeyEncrypted) throw new Error("No provider key configured");
  return decrypt(project.aiApiKeyEncrypted);
}
