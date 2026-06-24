import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/session";
import { unauthorizedResponse } from "@/lib/auth";
import { createProjectApiKey, getOwnedProject, listProjectApiKeys } from "@/lib/projects";
import type { CreateKeyRequest, ProjectNetwork } from "@/types/project";

const notFound = () => NextResponse.json({ error: "Project not found" }, { status: 404 });

/** GET /api/projects/:id/keys — list keys (masked). */
export async function GET(
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
  if (!project) return notFound();
  const keys = await listProjectApiKeys(project.id);
  return NextResponse.json({ keys });
}

/** POST /api/projects/:id/keys — generate a new key. Raw key returned ONCE. */
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
  if (!project) return notFound();

  let body: CreateKeyRequest = {};
  try {
    body = (await request.json()) as CreateKeyRequest;
  } catch {
    // empty body is fine — label is optional
  }
  const label =
    typeof body.label === "string" && body.label.trim().length > 0 ? body.label.trim() : null;

  const created = await createProjectApiKey(project.id, project.network as ProjectNetwork, label);
  return NextResponse.json(created, { status: 201 });
}
