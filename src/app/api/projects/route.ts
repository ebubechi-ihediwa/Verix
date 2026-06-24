import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/session";
import { unauthorizedResponse } from "@/lib/auth";
import {
  createProject,
  createProjectApiKey,
  listProjects,
  toProjectSummary,
  VALID_NETWORKS,
  VALID_PROVIDERS,
} from "@/lib/projects";
import type {
  CreateProjectRequest,
  CreateProjectResponse,
  ProjectAIProvider,
  ProjectNetwork,
} from "@/types/project";

/** GET /api/projects — list the current user's projects. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let userId: string;
  try {
    userId = (await requireUser(request)).id;
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
  const projects = await listProjects(userId);
  return NextResponse.json({ projects });
}

/** POST /api/projects — create a project (+ BYOK + first API key, returned once). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let userId: string;
  try {
    userId = (await requireUser(request)).id;
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }

  let body: Partial<CreateProjectRequest>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description =
    typeof body.description === "string" && body.description.trim().length > 0
      ? body.description.trim()
      : null;
  const network = body.network as ProjectNetwork;
  const aiProvider = body.aiProvider as ProjectAIProvider;
  const aiApiKey = typeof body.aiApiKey === "string" ? body.aiApiKey.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Project name is required" }, { status: 422 });
  }
  if (!VALID_NETWORKS.includes(network)) {
    return NextResponse.json({ error: "network must be 'testnet' or 'mainnet'" }, { status: 422 });
  }
  if (!VALID_PROVIDERS.includes(aiProvider)) {
    return NextResponse.json(
      { error: "aiProvider must be one of openai, anthropic, groq, kimi" },
      { status: 422 }
    );
  }
  if (!aiApiKey) {
    return NextResponse.json({ error: "aiApiKey is required" }, { status: 422 });
  }

  const project = await createProject({ userId, name, description, network, aiProvider, aiApiKey });
  const apiKey = await createProjectApiKey(project.id, network);

  const response: CreateProjectResponse = {
    project: toProjectSummary(project, true),
    apiKey: {
      id: apiKey.id,
      key: apiKey.key,
      keyPrefix: apiKey.keyPrefix,
      environment: apiKey.environment,
    },
  };
  return NextResponse.json(response, { status: 201 });
}
