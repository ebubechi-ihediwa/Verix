import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Auth seam: control project resolution per test.
vi.mock("@/lib/api-keys", () => ({
  findProjectByApiKey: vi.fn(),
}));

// DB seam: control Specialist queries.
vi.mock("@/lib/db", () => ({
  prisma: {
    specialist: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    agentVersion: { create: vi.fn() },
  },
}));

import { findProjectByApiKey } from "@/lib/api-keys";
import { prisma } from "@/lib/db";
import { GET as listAgents, POST as createAgentRoute } from "@/app/api/v1/agents/route";
import { GET as getAgentRoute } from "@/app/api/v1/agents/[agentId]/route";

const mockFind = findProjectByApiKey as unknown as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  specialist: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  agentVersion: { create: ReturnType<typeof vi.fn> };
};

const PROJECT_A = { id: "proj_A", userId: "u_A", name: "Project A", network: "testnet" };
const VALID_WALLET = "G" + "A".repeat(55);

function makeSpecialist(over: Record<string, unknown> = {}) {
  return {
    id: "agent_1",
    name: "vx_agent_internal_sentinel",
    description: "desc",
    endpoint: "sdk:pending",
    walletAddress: "GABC",
    capabilities: [] as string[],
    priceUsdc: 1.5,
    reputation: 50,
    totalJobs: 0,
    status: "online",
    aiModel: "openai",
    proofPolicy: "trace-only",
    projectId: "proj_A",
    agentType: "blend_yield",
    config: { name: "My Yield Agent", settings: { maxApy: 12 } },
    createdAt: new Date("2026-06-15T00:00:00.000Z"),
    ...over,
  };
}

function req(
  url: string,
  init: { method?: string; bearer?: string; body?: unknown } = {}
): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.bearer) headers.authorization = `Bearer ${init.bearer}`;
  return new NextRequest(`http://localhost${url}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/v1 Bearer auth", () => {
  it("returns 401 when the Authorization header is missing", async () => {
    const res = await listAgents(req("/api/v1/agents"));
    expect(res.status).toBe(401);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("returns 401 for a revoked/invalid key (findProjectByApiKey → null)", async () => {
    mockFind.mockResolvedValue(null);
    const res = await listAgents(req("/api/v1/agents", { bearer: "vx_test_revoked" }));
    expect(res.status).toBe(401);
    expect(mockFind).toHaveBeenCalledWith("vx_test_revoked");
  });

  it("returns 401 for a token without a vx_ prefix (no DB lookup)", async () => {
    const res = await listAgents(req("/api/v1/agents", { bearer: "not_a_verix_key" }));
    expect(res.status).toBe(401);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("succeeds with a valid key", async () => {
    mockFind.mockResolvedValue({ project: PROJECT_A, keyId: "key_1" });
    mockPrisma.specialist.findMany.mockResolvedValue([makeSpecialist()]);
    const res = await listAgents(req("/api/v1/agents", { bearer: "vx_test_valid" }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/agents", () => {
  it("creates a project-scoped agent + a v1 AgentVersion snapshot, echoes the public name", async () => {
    mockFind.mockResolvedValue({ project: PROJECT_A, keyId: "key_1" });
    mockPrisma.specialist.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(makeSpecialist({ ...data, id: "agent_new" }))
    );
    mockPrisma.agentVersion.create.mockResolvedValue({});

    const res = await createAgentRoute(
      req("/api/v1/agents", {
        method: "POST",
        bearer: "vx_test_valid",
        body: {
          name: "My Yield Agent",
          agentType: "blend_yield",
          walletAddress: VALID_WALLET,
          price: 1.5,
          config: { maxApy: 12 },
        },
      })
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.agent.name).toBe("My Yield Agent");
    expect(json.agent.agentType).toBe("blend_yield");

    // project scoping: create was called with projectId from the key's project
    const createArg = mockPrisma.specialist.create.mock.calls[0][0];
    expect(createArg.data.projectId).toBe("proj_A");
    // public name lives in config envelope, internal name is a generated sentinel
    expect(createArg.data.config.name).toBe("My Yield Agent");
    expect(createArg.data.name).toMatch(/^vx_agent_/);

    // a v1 AgentVersion snapshot is created using the PUBLIC name + a deterministic hash
    expect(mockPrisma.agentVersion.create).toHaveBeenCalledTimes(1);
    const versionArg = mockPrisma.agentVersion.create.mock.calls[0][0];
    expect(versionArg.data.version).toBe(1);
    expect(versionArg.data.name).toBe("My Yield Agent");
    expect(versionArg.data.name).not.toMatch(/^vx_agent_/);
    expect(versionArg.data.versionHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a missing name with 422", async () => {
    mockFind.mockResolvedValue({ project: PROJECT_A, keyId: "key_1" });
    const res = await createAgentRoute(
      req("/api/v1/agents", {
        method: "POST",
        bearer: "vx_test_valid",
        body: { price: 1, walletAddress: VALID_WALLET },
      })
    );
    expect(res.status).toBe(422);
    expect(mockPrisma.specialist.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid walletAddress with 422 (no agent created)", async () => {
    mockFind.mockResolvedValue({ project: PROJECT_A, keyId: "key_1" });
    const res = await createAgentRoute(
      req("/api/v1/agents", {
        method: "POST",
        bearer: "vx_test_valid",
        body: { name: "Bad Wallet Agent", walletAddress: "GABC" },
      })
    );
    expect(res.status).toBe(422);
    expect(mockPrisma.specialist.create).not.toHaveBeenCalled();
    expect(mockPrisma.agentVersion.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/agents (list isolation)", () => {
  it("queries only the authenticated project's agents", async () => {
    mockFind.mockResolvedValue({ project: PROJECT_A, keyId: "key_1" });
    mockPrisma.specialist.findMany.mockResolvedValue([
      makeSpecialist({ id: "a1", config: { name: "Agent One", settings: {} } }),
      makeSpecialist({ id: "a2", config: { name: "Agent Two", settings: {} } }),
    ]);

    const res = await listAgents(req("/api/v1/agents", { bearer: "vx_test_valid" }));
    const json = await res.json();

    expect(json.agents).toHaveLength(2);
    expect(json.agents.map((a: { name: string }) => a.name)).toEqual(["Agent One", "Agent Two"]);
    expect(mockPrisma.specialist.findMany.mock.calls[0][0].where).toEqual({ projectId: "proj_A" });
  });
});

describe("GET /api/v1/agents/:agentId (cross-project isolation)", () => {
  it("returns 404 when the agent belongs to another project", async () => {
    mockFind.mockResolvedValue({ project: PROJECT_A, keyId: "key_1" });
    // findFirst is scoped by projectId, so a project-B agent resolves to null
    mockPrisma.specialist.findFirst.mockResolvedValue(null);

    const res = await getAgentRoute(req("/api/v1/agents/agent_from_B", { bearer: "vx_test_valid" }), {
      params: Promise.resolve({ agentId: "agent_from_B" }),
    });

    expect(res.status).toBe(404);
    expect(mockPrisma.specialist.findFirst.mock.calls[0][0].where).toEqual({
      id: "agent_from_B",
      projectId: "proj_A",
    });
  });

  it("returns the agent when it belongs to the project", async () => {
    mockFind.mockResolvedValue({ project: PROJECT_A, keyId: "key_1" });
    mockPrisma.specialist.findFirst.mockResolvedValue(makeSpecialist({ id: "agent_owned" }));

    const res = await getAgentRoute(req("/api/v1/agents/agent_owned", { bearer: "vx_test_valid" }), {
      params: Promise.resolve({ agentId: "agent_owned" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.agent.id).toBe("agent_owned");
  });
});
