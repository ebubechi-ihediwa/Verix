import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/session";
import { unauthorizedResponse } from "@/lib/auth";
import {
  deleteProject,
  getOwnedProject,
  projectHasActiveKey,
  toProjectSummary,
  updateProject,
} from "@/lib/projects";
import type { UpdateProjectRequest } from "@/types/project";

const notFound = () => NextResponse.json({ error: "Project not found" }, { status: 404 });

/** GET /api/projects/:id — owner-scoped project detail. */
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
  const hasKey = await projectHasActiveKey(project.id);
  return NextResponse.json({ project: toProjectSummary(project, hasKey) });
}

/** PATCH /api/projects/:id — update name, description, webhookUrl. */
export async function PATCH(
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

  let body: UpdateProjectRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fields: UpdateProjectRequest = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Project name cannot be empty" }, { status: 422 });
    fields.name = name;
  }
  if (typeof body.description === "string") fields.description = body.description.trim();
  if (typeof body.webhookUrl === "string") fields.webhookUrl = body.webhookUrl.trim();

  const updated = await updateProject(project.id, fields);
  const hasKey = await projectHasActiveKey(project.id);
  return NextResponse.json({ project: toProjectSummary(updated, hasKey) });
}

/** DELETE /api/projects/:id — delete the project (cascades keys). */
export async function DELETE(
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
  await deleteProject(project.id);
  return NextResponse.json({ ok: true });
}
