/**
 * Developer console data layer.
 *
 * Uses cookie-based session auth (the `asn_session` cookie set by /api/auth/*).
 * Unlike lib/api-client.ts, it deliberately does NOT attach an `x-session-id`
 * header — that header takes precedence over the cookie server-side and would
 * shadow the authenticated session with a legacy anonymous one. Same-origin
 * fetch sends the httpOnly cookie automatically, so auth "just works".
 */

import type {
  ApiKeyView,
  CreateKeyResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  ProjectSummary,
  SetProviderRequest,
  SetProviderResponse,
  TestProviderRequest,
  TestProviderResponse,
  UpdateProjectRequest,
} from "@/types/project";
import type {
  AgentResponse,
  ConsoleExecutionRow,
  ConsoleVerificationRow,
} from "@/types/sdk";

export interface ConsoleUser {
  id: string;
  email: string;
  displayName: string | null;
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || body.message || `Request failed (${res.status})`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  // 204 / empty bodies
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function signup(
  email: string,
  password: string,
  displayName?: string
): Promise<ConsoleUser> {
  const data = await req<{ user: ConsoleUser }>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
  return data.user;
}

export async function login(email: string, password: string): Promise<ConsoleUser> {
  const data = await req<{ user: ConsoleUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return data.user;
}

export async function logout(): Promise<void> {
  await req("/api/auth/logout", { method: "POST" });
}

/** Returns the current user, or null if unauthenticated (401). */
export async function getMe(): Promise<ConsoleUser | null> {
  try {
    const data = await req<{ user: ConsoleUser }>("/api/auth/me");
    return data.user;
  } catch (e) {
    if ((e as { status?: number }).status === 401) return null;
    throw e;
  }
}

// ── Projects ─────────────────────────────────────────────────────────────────

export async function listProjects(): Promise<ProjectSummary[]> {
  const data = await req<{ projects: ProjectSummary[] }>("/api/projects");
  return data.projects;
}

export async function createProject(input: CreateProjectRequest): Promise<CreateProjectResponse> {
  return req("/api/projects", { method: "POST", body: JSON.stringify(input) });
}

export async function getProject(id: string): Promise<ProjectSummary> {
  const data = await req<{ project: ProjectSummary }>(`/api/projects/${encodeURIComponent(id)}`);
  return data.project;
}

export async function updateProject(id: string, fields: UpdateProjectRequest): Promise<ProjectSummary> {
  const data = await req<{ project: ProjectSummary }>(`/api/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
  return data.project;
}

export async function deleteProject(id: string): Promise<void> {
  await req(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ── API keys ─────────────────────────────────────────────────────────────────

export async function listApiKeys(projectId: string): Promise<ApiKeyView[]> {
  const data = await req<{ keys: ApiKeyView[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/keys`
  );
  return data.keys;
}

export async function createApiKey(projectId: string, label?: string): Promise<CreateKeyResponse> {
  return req(`/api/projects/${encodeURIComponent(projectId)}/keys`, {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export async function revokeApiKey(projectId: string, keyId: string): Promise<void> {
  await req(
    `/api/projects/${encodeURIComponent(projectId)}/keys/${encodeURIComponent(keyId)}`,
    { method: "DELETE" }
  );
}

// ── Provider (BYOK) ──────────────────────────────────────────────────────────

export async function setProvider(
  projectId: string,
  input: SetProviderRequest
): Promise<SetProviderResponse> {
  return req(`/api/projects/${encodeURIComponent(projectId)}/provider`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function testProvider(
  projectId: string,
  input: TestProviderRequest = {}
): Promise<TestProviderResponse> {
  return req(`/api/projects/${encodeURIComponent(projectId)}/provider/test`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Standalone provider test for the create-project wizard (no project yet). */
export async function testProviderStandalone(
  aiProvider: string,
  aiApiKey: string
): Promise<TestProviderResponse> {
  return req("/api/provider/test", {
    method: "POST",
    body: JSON.stringify({ aiProvider, aiApiKey }),
  });
}

// ── Console tabs (owner-scoped, cookie auth) ─────────────────────────────────

export async function listProjectAgents(projectId: string): Promise<AgentResponse[]> {
  const data = await req<{ agents: AgentResponse[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/agents`
  );
  return data.agents;
}

export async function listProjectExecutions(projectId: string): Promise<ConsoleExecutionRow[]> {
  const data = await req<{ executions: ConsoleExecutionRow[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/executions`
  );
  return data.executions;
}

export async function listProjectVerifications(
  projectId: string
): Promise<ConsoleVerificationRow[]> {
  const data = await req<{ verifications: ConsoleVerificationRow[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/verifications`
  );
  return data.verifications;
}
