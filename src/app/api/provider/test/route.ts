import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/session";
import { unauthorizedResponse } from "@/lib/auth";
import { testProviderKey, VALID_PROVIDERS } from "@/lib/projects";
import type { ProjectAIProvider, TestProviderResponse } from "@/types/project";

/**
 * POST /api/provider/test
 *
 * Standalone, project-less provider connection test for the create-project
 * wizard (where no project exists yet). Authed via session; tests a supplied
 * provider + raw key and persists nothing. Reuses lib/projects.testProviderKey.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireUser(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }

  let body: { aiProvider?: unknown; aiApiKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const aiProvider = body.aiProvider as ProjectAIProvider;
  const aiApiKey = typeof body.aiApiKey === "string" ? body.aiApiKey.trim() : "";

  if (!VALID_PROVIDERS.includes(aiProvider)) {
    return NextResponse.json({ error: "Invalid aiProvider" }, { status: 422 });
  }
  if (!aiApiKey) {
    return NextResponse.json({ error: "aiApiKey is required" }, { status: 422 });
  }

  const result: TestProviderResponse = await testProviderKey(aiProvider, aiApiKey);
  return NextResponse.json(result);
}
