import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-keys", () => ({ findProjectByApiKey: vi.fn() }));
vi.mock("@/services/coordinator", () => ({ resumeExecution: vi.fn() }));

import { findProjectByApiKey } from "@/lib/api-keys";
import { resumeExecution } from "@/services/coordinator";
import { POST as resume } from "@/app/api/v1/executions/[id]/resume/route";

const mockFind = findProjectByApiKey as unknown as ReturnType<typeof vi.fn>;
const mockResume = resumeExecution as unknown as ReturnType<typeof vi.fn>;

function req(init: { bearer?: string; body?: unknown } = {}): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.bearer) headers.authorization = `Bearer ${init.bearer}`;
  return new NextRequest("http://localhost/api/v1/executions/task_1/resume", {
    method: "POST",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}
const params = { params: Promise.resolve({ id: "task_1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockFind.mockResolvedValue({ project: { id: "proj_A" }, keyId: "k1" });
});

describe("POST /api/v1/executions/:id/resume", () => {
  it("401 without a key", async () => {
    const res = await resume(req({ body: { signedXdr: "X" } }), params);
    expect(res.status).toBe(401);
    expect(mockResume).not.toHaveBeenCalled();
  });

  it("422 when signedXdr is missing", async () => {
    const res = await resume(req({ bearer: "vx_test_x", body: {} }), params);
    expect(res.status).toBe(422);
    expect(mockResume).not.toHaveBeenCalled();
  });

  it("404 when there is no signature request (incl. cross-project)", async () => {
    mockResume.mockResolvedValue({ kind: "not_found" });
    const res = await resume(req({ bearer: "vx_test_x", body: { signedXdr: "X" } }), params);
    expect(res.status).toBe(404);
    expect(mockResume).toHaveBeenCalledWith("proj_A", "task_1", "X");
  });

  it("409 when expired", async () => {
    mockResume.mockResolvedValue({ kind: "expired" });
    const res = await resume(req({ bearer: "vx_test_x", body: { signedXdr: "X" } }), params);
    expect(res.status).toBe(409);
  });

  it("409 when not awaiting a signature", async () => {
    mockResume.mockResolvedValue({ kind: "not_awaiting" });
    const res = await resume(req({ bearer: "vx_test_x", body: { signedXdr: "X" } }), params);
    expect(res.status).toBe(409);
  });

  it("200 idempotent when already resumed (no resubmit)", async () => {
    mockResume.mockResolvedValue({ kind: "already", status: "resolved", txHash: "TXOLD" });
    const res = await resume(req({ bearer: "vx_test_x", body: { signedXdr: "X" } }), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.execution.status).toBe("already_resumed");
    expect(json.execution.txHash).toBe("TXOLD");
  });

  it("200 on a fresh resume with the tx hash", async () => {
    mockResume.mockResolvedValue({ kind: "resumed", txHash: "TXNEW" });
    const res = await resume(req({ bearer: "vx_test_x", body: { signedXdr: "SIGNED" } }), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.execution.status).toBe("resumed");
    expect(json.execution.txHash).toBe("TXNEW");
  });

  it("502 when the resume itself throws", async () => {
    mockResume.mockRejectedValue(new Error("submit failed"));
    const res = await resume(req({ bearer: "vx_test_x", body: { signedXdr: "X" } }), params);
    expect(res.status).toBe(502);
  });
});
