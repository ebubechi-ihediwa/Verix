import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/session";
import { unauthorizedResponse } from "@/lib/auth";
import { getOwnedProject, revokeProjectApiKey } from "@/lib/projects";

/** DELETE /api/projects/:id/keys/:keyId — revoke an API key (sets revokedAt). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; keyId: string }> }
): Promise<NextResponse> {
  let userId: string;
  try {
    userId = (await requireUser(request)).id;
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
  const { id, keyId } = await params;
  const project = await getOwnedProject(id, userId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const ok = await revokeProjectApiKey(project.id, keyId);
  if (!ok) return NextResponse.json({ error: "API key not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
