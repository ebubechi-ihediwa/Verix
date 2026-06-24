import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/session";
import { unauthorizedResponse } from "@/lib/auth";
import { getOwnedProject } from "@/lib/projects";
import { listProjectExecutions } from "@/lib/console-data";

const notFound = () => NextResponse.json({ error: "Project not found" }, { status: 404 });

/** GET /api/projects/:id/executions — owner-scoped execution/receipt rows. */
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

  const executions = await listProjectExecutions(project.id);
  return NextResponse.json({ executions });
}
