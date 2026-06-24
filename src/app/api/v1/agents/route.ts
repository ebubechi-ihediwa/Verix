import { NextRequest, NextResponse } from "next/server";
import { authenticateBearer } from "@/lib/v1-auth";
import { createAgent, listAgents, toAgentResponse } from "@/lib/v1-agents";
import { isStellarPublicKey } from "@/lib/stellar-config";
import type { AgentListResponse, CreateAgentRequest } from "@/types/sdk";

/** GET /api/v1/agents — list this project's agents. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateBearer(request);
  if (!auth.ok) return auth.response;

  const agents = await listAgents(auth.context.project.id);
  const body: AgentListResponse = { agents: agents.map(toAgentResponse) };
  return NextResponse.json(body);
}

/** POST /api/v1/agents — create a project-scoped agent (internal Specialist row). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateBearer(request);
  if (!auth.ok) return auth.response;

  let body: CreateAgentRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 422 });
  }
  // Agents must have a valid Stellar payout wallet so pinned executions can pay
  // and the AgentVersion snapshot commits to a real address. Fail early.
  if (!isStellarPublicKey(typeof body.walletAddress === "string" ? body.walletAddress.trim() : "")) {
    return NextResponse.json(
      { error: "walletAddress must be a valid Stellar public key (G...)" },
      { status: 422 }
    );
  }
  if (body.price !== undefined && (typeof body.price !== "number" || body.price < 0)) {
    return NextResponse.json({ error: "price must be a non-negative number" }, { status: 422 });
  }
  if (body.capabilities !== undefined && !Array.isArray(body.capabilities)) {
    return NextResponse.json({ error: "capabilities must be an array of strings" }, { status: 422 });
  }

  const agent = await createAgent(auth.context.project.id, {
    ...body,
    name: body.name.trim(),
  });
  return NextResponse.json({ agent: toAgentResponse(agent) }, { status: 201 });
}
