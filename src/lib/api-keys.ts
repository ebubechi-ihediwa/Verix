import { randomBytes, createHash } from "crypto";
import type { Project } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { KeyEnvironment, ProjectNetwork } from "@/types/project";

/**
 * Verix project API key generation, hashing, and lookup.
 *
 * Format: vx_{env}_{token} where env ∈ {live,test} (live = mainnet, test = testnet)
 * and token is 24 random bytes, url-safe. Only sha256(rawKey) is ever persisted
 * (keyHash); the raw key is returned to the caller exactly once at creation.
 */

const TOKEN_BYTES = 24;
const PREFIX_LENGTH = 12; // "vx_test_" (8) + 4 chars

export interface GeneratedApiKey {
  raw: string;
  keyHash: string;
  keyPrefix: string;
  last4: string;
  environment: KeyEnvironment;
}

/** Deterministic lookup hash for a raw API key. */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Generate a fresh API key for the given network. Pure (no DB) — the caller
 * persists keyHash/keyPrefix/last4 and surfaces `raw` to the developer once.
 */
export function generateApiKey(network: ProjectNetwork): GeneratedApiKey {
  const environment: KeyEnvironment = network === "mainnet" ? "live" : "test";
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const raw = `vx_${environment}_${token}`;
  return {
    raw,
    keyHash: hashApiKey(raw),
    keyPrefix: raw.slice(0, PREFIX_LENGTH),
    last4: raw.slice(-4),
    environment,
  };
}

/**
 * Resolve a raw API key to its project, or null if the key is unknown or revoked.
 * On a successful match, lastUsedAt is updated (best-effort, non-blocking).
 *
 * NOTE: this is the seam consumed by the Phase 2 SDK gateway (Bearer auth). It is
 * implemented and tested now but not wired into any /api/v1 route yet.
 */
export async function findProjectByApiKey(
  raw: string
): Promise<{ project: Project; keyId: string } | null> {
  if (!raw) return null;

  const record = await prisma.projectApiKey.findUnique({
    where: { keyHash: hashApiKey(raw) },
    include: { project: true },
  });

  if (!record) return null;
  if (record.revokedAt) return null; // reject revoked keys

  // Best-effort usage stamp; never block auth on this write.
  void prisma.projectApiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { project: record.project, keyId: record.id };
}
