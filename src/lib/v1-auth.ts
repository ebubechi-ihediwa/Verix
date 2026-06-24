import { NextRequest, NextResponse } from "next/server";
import type { Project } from "@prisma/client";
import { findProjectByApiKey } from "@/lib/api-keys";

/**
 * Bearer authentication for the SDK gateway (/api/v1).
 *
 * Source of truth is lib/api-keys.findProjectByApiKey() — it hashes the raw key,
 * resolves the owning project, and rejects unknown/revoked keys. The legacy
 * anonymous x-session-id model is intentionally NOT consulted here.
 */

export interface V1AuthContext {
  project: Project;
  keyId: string;
}

export type V1AuthResult =
  | { ok: true; context: V1AuthContext }
  | { ok: false; response: NextResponse };

const VALID_KEY_PREFIXES = ["vx_test_", "vx_live_"];

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

/** Extract a Bearer token from an Authorization header, or null if absent/malformed. */
export function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

/**
 * Authenticate an /api/v1 request. Returns the resolved project context on
 * success, or a ready-to-return 401 NextResponse on any failure.
 *
 * 401 cases: no Authorization header, malformed header, wrong key prefix,
 * unknown key, revoked key.
 */
export async function authenticateBearer(request: NextRequest): Promise<V1AuthResult> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) {
    return {
      ok: false,
      response: jsonError("Missing or malformed Authorization header. Use 'Bearer vx_...'", 401),
    };
  }

  if (!VALID_KEY_PREFIXES.some((p) => token.startsWith(p))) {
    return { ok: false, response: jsonError("Invalid API key format", 401) };
  }

  const resolved = await findProjectByApiKey(token);
  if (!resolved) {
    return { ok: false, response: jsonError("Invalid or revoked API key", 401) };
  }

  return { ok: true, context: { project: resolved.project, keyId: resolved.keyId } };
}
