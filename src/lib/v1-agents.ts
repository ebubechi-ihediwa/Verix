import { randomBytes } from "crypto";
import type { Prisma, Specialist } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeVersionHash } from "@/services/discovery";
import type {
  AgentConfig,
  AgentResponse,
  CreateAgentRequest,
  UpdateAgentRequest,
} from "@/types/sdk";

/**
 * Project-scoped agent CRUD over the internal `Specialist` model.
 *
 * Public API vocabulary is "Agent"; the DB model stays `Specialist` (not renamed).
 * Because `Specialist.name` is globally unique (discovery upserts by name), the
 * developer-facing name + arbitrary settings are stored in `Specialist.config`
 * as { name, settings }, and the `name` column holds a unique internal sentinel.
 *
 * Every function is scoped by projectId so cross-project access is impossible.
 */

interface ConfigEnvelope {
  name: string;
  settings: AgentConfig;
}

function readEnvelope(s: Specialist): ConfigEnvelope {
  const raw = (s.config ?? {}) as { name?: unknown; settings?: unknown };
  return {
    name: typeof raw.name === "string" ? raw.name : s.name,
    settings:
      raw.settings && typeof raw.settings === "object" && !Array.isArray(raw.settings)
        ? (raw.settings as AgentConfig)
        : {},
  };
}

function writeEnvelope(env: ConfigEnvelope): Prisma.InputJsonValue {
  return { name: env.name, settings: env.settings } as Prisma.InputJsonValue;
}

/** Globally-unique internal sentinel for the Specialist.name column. */
function internalName(): string {
  return `vx_agent_${randomBytes(10).toString("hex")}`;
}

export function toAgentResponse(s: Specialist): AgentResponse {
  const env = readEnvelope(s);
  return {
    id: s.id,
    projectId: s.projectId ?? "",
    name: env.name,
    agentType: s.agentType ?? null,
    description: s.description,
    walletAddress: s.walletAddress,
    price: Number(s.priceUsdc),
    capabilities: s.capabilities,
    config: env.settings,
    aiModel: s.aiModel ?? null,
    proofPolicy: s.proofPolicy,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
  };
}

export async function createAgent(
  projectId: string,
  input: CreateAgentRequest
): Promise<Specialist> {
  const envelope: ConfigEnvelope = { name: input.name, settings: input.config ?? {} };
  const wallet = input.walletAddress?.trim() ?? "";
  const price = input.price ?? 0;
  const capabilities = input.capabilities ?? [];
  const proofPolicy = input.proofPolicy ?? "trace-only";
  const aiModel = input.aiModel ?? "openai";

  const specialist = await prisma.specialist.create({
    data: {
      name: internalName(),
      description: input.description?.trim() || input.name,
      endpoint: "sdk:pending",
      walletAddress: wallet,
      capabilities,
      priceUsdc: price,
      aiModel,
      proofPolicy,
      projectId,
      agentType: input.agentType ?? null,
      config: writeEnvelope(envelope),
      currentVersion: 1,
    },
  });

  // Immutable v1 snapshot so pinned executions reference a real AgentVersion and
  // proof constraint 4 (agent membership) passes. The snapshot uses the PUBLIC
  // display name (config.name), never the internal vx_agent_ sentinel.
  const versionHash = computeVersionHash(
    input.name,
    1,
    price,
    wallet,
    capabilities,
    proofPolicy,
    aiModel
  );
  await prisma.agentVersion.create({
    data: {
      specialistId: specialist.id,
      version: 1,
      name: input.name,
      description: input.description?.trim() || input.name,
      walletAddress: wallet,
      capabilities,
      priceUsdc: price,
      proofPolicy,
      aiModel,
      versionHash,
    },
  });

  return specialist;
}

export async function listAgents(projectId: string): Promise<Specialist[]> {
  return prisma.specialist.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
}

/** Returns the agent only if it belongs to `projectId` (else null → routes 404). */
export async function getAgent(projectId: string, agentId: string): Promise<Specialist | null> {
  return prisma.specialist.findFirst({ where: { id: agentId, projectId } });
}

export async function updateAgent(
  projectId: string,
  agentId: string,
  input: UpdateAgentRequest
): Promise<Specialist | null> {
  const existing = await getAgent(projectId, agentId);
  if (!existing) return null;

  const env = readEnvelope(existing);
  const nextEnvelope: ConfigEnvelope = {
    name: input.name?.trim() || env.name,
    settings: input.config ?? env.settings,
  };

  return prisma.specialist.update({
    where: { id: agentId },
    data: {
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.walletAddress !== undefined ? { walletAddress: input.walletAddress.trim() } : {}),
      ...(input.price !== undefined ? { priceUsdc: input.price } : {}),
      ...(input.capabilities !== undefined ? { capabilities: input.capabilities } : {}),
      ...(input.aiModel !== undefined ? { aiModel: input.aiModel } : {}),
      ...(input.proofPolicy !== undefined ? { proofPolicy: input.proofPolicy } : {}),
      ...(input.agentType !== undefined ? { agentType: input.agentType } : {}),
      ...(input.name !== undefined || input.config !== undefined
        ? { config: writeEnvelope(nextEnvelope) }
        : {}),
    },
  });
}

/** Deletes the agent only if it belongs to `projectId`. Returns false otherwise. */
export async function deleteAgent(projectId: string, agentId: string): Promise<boolean> {
  const existing = await getAgent(projectId, agentId);
  if (!existing) return false;
  await prisma.specialist.delete({ where: { id: agentId } });
  return true;
}
