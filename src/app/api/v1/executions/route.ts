import { NextRequest, NextResponse } from "next/server";
import { authenticateBearer } from "@/lib/v1-auth";
import { createProjectExecution, listExecutions } from "@/lib/v1-executions";
import type { CreateExecutionRequest, ExecutionListResponse } from "@/types/sdk";

/** GET /api/v1/executions — list this project's executions (tasks). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateBearer(request);
  if (!auth.ok) return auth.response;

  const executions = await listExecutions(auth.context.project.id);
  const body: ExecutionListResponse = { executions };
  return NextResponse.json(body);
}

/**
 * POST /api/v1/executions — submit a mandate for project-scoped execution.
 *
 * Validates that `agentId` belongs to the caller's project, creates a Task
 * (projectId + agentId), and runs it through the existing coordinator/job
 * pipeline (trace → receipt → proof).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateBearer(request);
  if (!auth.ok) return auth.response;

  let body: CreateExecutionRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.agentId !== "string" || !body.agentId.trim()) {
    return NextResponse.json({ error: "agentId is required" }, { status: 422 });
  }

  const description = (body.description ?? body.mandate ?? "").trim();
  if (!description) {
    return NextResponse.json(
      { error: "description or mandate is required" },
      { status: 422 }
    );
  }
  if (body.spendCap !== undefined && (typeof body.spendCap !== "number" || body.spendCap <= 0)) {
    return NextResponse.json({ error: "spendCap must be a positive number" }, { status: 422 });
  }

  const result = await createProjectExecution(auth.context.project.id, auth.context.project.userId, {
    ...body,
    agentId: body.agentId.trim(),
    description,
  });

  // null = agent missing / not owned by this project → 404, no existence leak
  if (!result) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  return NextResponse.json({ execution: result }, { status: 201 });
}
