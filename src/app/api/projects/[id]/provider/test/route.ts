import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/session";
import { unauthorizedResponse } from "@/lib/auth";
import {
  decryptProviderKey,
  getOwnedProject,
  testProviderKey,
  VALID_PROVIDERS,
} from "@/lib/projects";
import type { ProjectAIProvider, TestProviderRequest, TestProviderResponse } from "@/types/project";

/**
 * POST /api/projects/:id/provider/test
 * Tests a provider key without persisting anything. If a raw key is supplied in
 * the body it is tested; otherwise the stored (decrypted) key is tested.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  let userId: string;
  try {
    userId = (await requireUser(request)).id;
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
  const { id } = await params;
  const project = await getOwnedProject(id, userId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let body: TestProviderRequest = {};
  try {
    body = (await request.json()) as TestProviderRequest;
  } catch {
    // empty body → test the stored key
  }

  const provider = (body.aiProvider as ProjectAIProvider) ?? (project.aiProvider as ProjectAIProvider);
  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Invalid aiProvider" }, { status: 422 });
  }

  let rawKey: string;
  if (typeof body.aiApiKey === "string" && body.aiApiKey.trim().length > 0) {
    rawKey = body.aiApiKey.trim();
  } else {
    try {
      rawKey = decryptProviderKey(project);
    } catch {
      const res: TestProviderResponse = { ok: false, detail: "No provider key configured" };
      return NextResponse.json(res);
    }
  }

  const result = await testProviderKey(provider, rawKey);
  const res: TestProviderResponse = result;
  return NextResponse.json(res);
}
