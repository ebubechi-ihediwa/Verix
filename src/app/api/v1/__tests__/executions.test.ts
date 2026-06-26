import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Auth seam.
vi.mock("@/lib/api-keys", () => ({ findProjectByApiKey: vi.fn() }));

// Keep the coordinator/proof/execution side effects out of the test — we assert
// wiring, not the full pipeline. startExecution is stubbed so no job runs.
vi.mock("@/services/coordinator", () => ({ executeCoordinator: vi.fn() }));
vi.mock("@/services/proof", () => ({ verifyProof: vi.fn() }));
vi.mock("@/services/execution", () => ({
  createExecution: vi.fn(),
  startExecution: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    specialist: { findFirst: vi.fn() },
    task: { findMany: vi.fn(), findFirst: vi.fn() },
    executionTraceEvent: { count: vi.fn() },
    executionSignatureRequest: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

import { findProjectByApiKey } from "@/lib/api-keys";
import { createExecution, startExecution } from "@/services/execution";
import { prisma } from "@/lib/db";
import { GET as listExecutions, POST as createExecutionRoute } from "@/app/api/v1/executions/route";
import { GET as getExecutionRoute } from "@/app/api/v1/executions/[id]/route";

const mockFind = findProjectByApiKey as unknown as ReturnType<typeof vi.fn>;
const mockCreate = createExecution as unknown as ReturnType<typeof vi.fn>;
const mockStart = startExecution as unknown as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  specialist: { findFirst: ReturnType<typeof vi.fn> };
  task: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  executionTraceEvent: { count: ReturnType<typeof vi.fn> };
};

const PROJECT_A = { id: "proj_A", userId: "u_A", name: "Project A", network: "testnet" };

function makeSpecialist(over: Record<string, unknown> = {}) {
  return {
    id: "agent_1",
    name: "vx_agent_internal",
    config: { name: "My Yield Agent", settings: {} },
    projectId: "proj_A",
    ...over,
  };
}

function makeTask(over: Record<string, unknown> = {}) {
  return {
    id: "task_1",
    description: "Rebalance the treasury",
    status: "completed",
    agentId: "agent_1",
    projectId: "proj_A",
    totalCost: 1.5,
    spendCap: 50,
    result: { summary: "done" },
    createdAt: new Date("2026-06-15T00:00:00.000Z"),
    completedAt: new Date("2026-06-15T00:01:00.000Z"),
    receipt: null,
    ...over,
  };
}

function req(url: string, init: { method?: string; bearer?: string; body?: unknown } = {}): NextRequest {
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

describe("POST /api/v1/executions", () => {
  it("returns 401 when the API key is missing", async () => {
    const res = await createExecutionRoute(
      req("/api/v1/executions", { method: "POST", body: { agentId: "agent_1", description: "x" } })
    );
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates a project-scoped execution with a valid key", async () => {
    mockFind.mockResolvedValue({ project: PROJECT_A, keyId: "key_1" });
    mockPrisma.specialist.findFirst.mockResolvedValue(makeSpecialist()); // agent owned by proj_A
    mockCreate.mockResolvedValue({
      task: {
        id: "task_new",
        status: "decomposing",
        createdAt: "2026-06-15T00:00:00.000Z",
        projectId: "proj_A",
        agentId: "agent_1",
      },
      estimate: { estimated_cost: 1, subtasks: [] },
    });
    mockStart.mockResolvedValue("job_1");

    const res = await createExecutionRoute(
      req("/api/v1/executions", {
        method: "POST",
        bearer: "vx_test_valid",
        body: { agentId: "agent_1", mandate: "Supply 100 USDC to the lending pool", spendCap: 10 },
      })
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.execution.id).toBe("task_new");
    expect(json.execution.agentId).toBe("agent_1");
    expect(json.execution.status).toBe("decomposing");

    // created task carries the correct projectId + agentId AND is pinned to the agent
    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg.projectId).toBe("proj_A");
    expect(createArg.agentId).toBe("agent_1");
    expect(createArg.requestedSpecialistId).toBe("agent_1"); // pinned execution
    expect(createArg.description).toBe("Supply 100 USDC to the lending pool");
    // owner is the project owner
    expect(mockCreate.mock.calls[0][1]).toBe("u_A");
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it("cannot execute with another project's agent (404, no task created)", async () => {
    mockFind.mockResolvedValue({ project: PROJECT_A, keyId: "key_1" });
    mockPrisma.specialist.findFirst.mockResolvedValue(null); // scoped query: not in proj_A

    const res = await createExecutionRoute(
      req("/api/v1/executions", {
        method: "POST",
        bearer: "vx_test_valid",
        body: { agentId: "agent_from_B", description: "do it" },
      })
    );

    expect(res.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
    // scoping enforced on the agent lookup
    expect(mockPrisma.specialist.findFirst.mock.calls[0][0].where).toEqual({
      id: "agent_from_B",
      projectId: "proj_A",
    });
  });

  it("rejects a missing description/mandate with 422", async () => {
    mockFind.mockResolvedValue({ project: PROJECT_A, keyId: "key_1" });
    const res = await createExecutionRoute(
      req("/api/v1/executions", { method: "POST", bearer: "vx_test_valid", body: { agentId: "agent_1" } })
    );
    expect(res.status).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/executions (list isolation)", () => {
  it("returns only the authenticated project's executions", async () => {
    mockFind.mockResolvedValue({ project: PROJECT_A, keyId: "key_1" });
    mockPrisma.task.findMany.mockResolvedValue([
      makeTask({ id: "t1", receipt: { receiptHash: "a".repeat(64) } }),
      makeTask({ id: "t2", receipt: null }),
    ]);

    const res = await listExecutions(req("/api/v1/executions", { bearer: "vx_test_valid" }));
    const json = await res.json();

    expect(json.executions).toHaveLength(2);
    expect(json.executions[0].receiptHash).toBe("a".repeat(64));
    expect(json.executions.map((e: { id: string }) => e.id)).toEqual(["t1", "t2"]);
    expect(mockPrisma.task.findMany.mock.calls[0][0].where).toEqual({ projectId: "proj_A" });
  });
});

describe("GET /api/v1/executions/:id", () => {
  it("returns trace/receipt and the developer-facing agent name when available", async () => {
    mockFind.mockResolvedValue({ project: PROJECT_A, keyId: "key_1" });
    mockPrisma.task.findFirst.mockResolvedValue(
      makeTask({
        receipt: {
          receiptHash: "b".repeat(64),
          traceRoot: "c".repeat(64),
          totalCost: 1.5,
          spendCap: 50,
          status: "verified",
          createdAt: new Date("2026-06-15T00:02:00.000Z"),
        },
      })
    );
    mockPrisma.specialist.findFirst.mockResolvedValue(makeSpecialist());
    mockPrisma.executionTraceEvent.count.mockResolvedValue(8);

    const res = await getExecutionRoute(req("/api/v1/executions/task_1", { bearer: "vx_test_valid" }), {
      params: Promise.resolve({ id: "task_1" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.execution.receipt.receiptHash).toBe("b".repeat(64));
    expect(json.execution.trace).toEqual({ root: "c".repeat(64), eventCount: 8 });
    // public name from config.name, NOT the internal vx_agent_ sentinel
    expect(json.execution.agent).toEqual({ id: "agent_1", name: "My Yield Agent" });
    expect(json.execution.agent.name).not.toMatch(/^vx_agent_/);
  });

  it("returns 404 for an execution in another project", async () => {
    mockFind.mockResolvedValue({ project: PROJECT_A, keyId: "key_1" });
    mockPrisma.task.findFirst.mockResolvedValue(null); // scoped query: not in proj_A

    const res = await getExecutionRoute(req("/api/v1/executions/task_from_B", { bearer: "vx_test_valid" }), {
      params: Promise.resolve({ id: "task_from_B" }),
    });

    expect(res.status).toBe(404);
    expect(mockPrisma.task.findFirst.mock.calls[0][0].where).toEqual({
      id: "task_from_B",
      projectId: "proj_A",
    });
  });
});
