import { NextRequest, NextResponse } from "next/server";
import { authenticateBearer } from "@/lib/v1-auth";
import { getExecutionDetail } from "@/lib/v1-executions";

/** GET /api/v1/executions/:id — project-scoped execution detail (404 cross-project). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authenticateBearer(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const execution = await getExecutionDetail(auth.context.project.id, id);
  if (!execution) return NextResponse.json({ error: "Execution not found" }, { status: 404 });
  return NextResponse.json({ execution });
}
