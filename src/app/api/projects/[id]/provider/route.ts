import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/session";
import { unauthorizedResponse } from "@/lib/auth";
import { getOwnedProject, setProvider, VALID_PROVIDERS } from "@/lib/projects";
import type { ProjectAIProvider, SetProviderRequest, SetProviderResponse } from "@/types/project";

/** POST /api/projects/:id/provider — set/replace AI provider + BYOK key (encrypted). */
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

  let body: Partial<SetProviderRequest>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const aiProvider = body.aiProvider as ProjectAIProvider;
  const aiApiKey = typeof body.aiApiKey === "string" ? body.aiApiKey.trim() : "";

  if (!VALID_PROVIDERS.includes(aiProvider)) {
    return NextResponse.json(
      { error: "aiProvider must be one of openai, anthropic, groq, kimi" },
      { status: 422 }
    );
  }
  if (!aiApiKey) {
    return NextResponse.json({ error: "aiApiKey is required" }, { status: 422 });
  }

  const updated = await setProvider(project.id, aiProvider, aiApiKey);
  const response: SetProviderResponse = {
    aiProvider: updated.aiProvider as ProjectAIProvider,
    aiApiKeyMasked: updated.aiApiKeyMasked ?? "",
  };
  return NextResponse.json(response);
}
