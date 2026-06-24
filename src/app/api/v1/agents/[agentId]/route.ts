import { NextRequest, NextResponse } from "next/server";
import { authenticateBearer } from "@/lib/v1-auth";
import { deleteAgent, getAgent, toAgentResponse, updateAgent } from "@/lib/v1-agents";
import type { UpdateAgentRequest } from "@/types/sdk";

const notFound = () => NextResponse.json({ error: "Agent not found" }, { status: 404 });

/** GET /api/v1/agents/:agentId — project-scoped agent detail (404 cross-project). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
): Promise<NextResponse> {
  const auth = await authenticateBearer(request);
  if (!auth.ok) return auth.response;

  const { agentId } = await params;
  const agent = await getAgent(auth.context.project.id, agentId);
  if (!agent) return notFound();
  return NextResponse.json({ agent: toAgentResponse(agent) });
}

/** PATCH /api/v1/agents/:agentId — update mutable fields (project-scoped). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
): Promise<NextResponse> {
  const auth = await authenticateBearer(request);
  if (!auth.ok) return auth.response;

  const { agentId } = await params;

  let body: UpdateAgentRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 422 });
  }
  if (body.price !== undefined && (typeof body.price !== "number" || body.price < 0)) {
    return NextResponse.json({ error: "price must be a non-negative number" }, { status: 422 });
  }
  if (body.capabilities !== undefined && !Array.isArray(body.capabilities)) {
    return NextResponse.json({ error: "capabilities must be an array of strings" }, { status: 422 });
  }

  const updated = await updateAgent(auth.context.project.id, agentId, body);
  if (!updated) return notFound();
  return NextResponse.json({ agent: toAgentResponse(updated) });
}

/** DELETE /api/v1/agents/:agentId — delete (project-scoped; 404 cross-project). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
): Promise<NextResponse> {
  const auth = await authenticateBearer(request);
  if (!auth.ok) return auth.response;

  const { agentId } = await params;
  const ok = await deleteAgent(auth.context.project.id, agentId);
  if (!ok) return notFound();
  return NextResponse.json({ ok: true });
}
