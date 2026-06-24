import { describe, it, expect, vi } from "vitest";
import {
  Verix,
  VerixError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ApiError,
} from "@verix/sdk";

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientWith(fetchImpl: typeof fetch): Verix {
  return new Verix({ apiKey: "vx_test_key", baseUrl: "https://api.test", fetch: fetchImpl });
}

function anchorBody(status: string) {
  return {
    receiptHash: "h",
    receipt: {},
    proof: null,
    anchor: { status, txHash: status === "anchored" ? "TX1" : null, contractId: null, anchoredAt: null, explorerUrl: null },
  };
}

describe("config", () => {
  it("throws a VerixError without an apiKey", () => {
    expect(() => new Verix({ apiKey: "" })).toThrow(VerixError);
  });
});

describe("error mapping", () => {
  it("maps status codes to typed errors", async () => {
    const cases: Array<[number, new (...a: never[]) => VerixError]> = [
      [401, AuthenticationError],
      [404, NotFoundError],
      [400, ValidationError],
      [422, ValidationError],
      [429, RateLimitError],
      [500, ApiError],
      [503, ApiError],
    ];
    for (const [status, Cls] of cases) {
      const verix = clientWith(async () => jsonResponse(status, { error: `boom ${status}` }));
      await expect(verix.agents.list()).rejects.toBeInstanceOf(Cls);
    }
  });

  it("surfaces status, code, message and body", async () => {
    const verix = clientWith(async () => jsonResponse(404, { error: "Agent not found" }));
    await verix.agents.get("x").then(
      () => expect.fail("should have thrown"),
      (e: VerixError) => {
        expect(e).toBeInstanceOf(NotFoundError);
        expect(e.status).toBe(404);
        expect(e.code).toBe("not_found");
        expect(e.message).toBe("Agent not found");
        expect(e.body).toEqual({ error: "Agent not found" });
      }
    );
  });

  it("wraps network failures as VerixError", async () => {
    const verix = clientWith(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(verix.agents.list()).rejects.toMatchObject({ code: "network_error" });
  });
});

describe("agents", () => {
  it("create unwraps { agent } and sends a Bearer POST with JSON body", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse(201, { agent: { id: "a1", name: "Bot" } })
    );
    const verix = clientWith(fetchImpl as unknown as typeof fetch);

    const agent = await verix.agents.create({ name: "Bot", walletAddress: "G..." });
    expect(agent).toEqual({ id: "a1", name: "Bot" });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.test/api/v1/agents");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer vx_test_key");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Bot", walletAddress: "G..." });
  });

  it("list/get/update/delete hit the right routes", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === "GET") return jsonResponse(200, { agents: [{ id: "a1" }], agent: { id: "a1" } });
      if (init.method === "PATCH") return jsonResponse(200, { agent: { id: "a1", price: 2 } });
      return jsonResponse(200, { ok: true });
    });
    const verix = clientWith(fetchImpl as unknown as typeof fetch);

    expect(await verix.agents.list()).toEqual([{ id: "a1" }]);
    expect(await verix.agents.get("a1")).toEqual({ id: "a1" });
    expect(await verix.agents.update("a1", { price: 2 })).toEqual({ id: "a1", price: 2 });
    await expect(verix.agents.delete("a1")).resolves.toBeUndefined();

    const methods = fetchImpl.mock.calls.map((c) => (c[1] as RequestInit).method);
    expect(methods).toEqual(["GET", "GET", "PATCH", "DELETE"]);
    expect(fetchImpl.mock.calls[3][0]).toBe("https://api.test/api/v1/agents/a1");
  });
});

describe("executions", () => {
  it("create unwraps { execution }", async () => {
    const verix = clientWith(async () =>
      jsonResponse(201, {
        execution: { id: "t1", status: "decomposing", agentId: "a1", jobId: "j1", createdAt: "x" },
      })
    );
    const ex = await verix.executions.create({ agentId: "a1", mandate: "do it" });
    expect(ex.id).toBe("t1");
    expect(ex.status).toBe("decomposing");
  });

  it("list and get unwrap correctly", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith("/executions")
        ? jsonResponse(200, { executions: [{ id: "t1" }] })
        : jsonResponse(200, { execution: { id: "t1", agent: { id: "a1", name: "Bot" } } })
    );
    const verix = clientWith(fetchImpl as unknown as typeof fetch);
    expect(await verix.executions.list()).toEqual([{ id: "t1" }]);
    expect((await verix.executions.get("t1")).agent?.name).toBe("Bot");
  });
});

describe("receipts", () => {
  it("get returns the full receipt+proof+anchor envelope", async () => {
    const verix = clientWith(async () => jsonResponse(200, anchorBody("anchored")));
    const r = await verix.receipts.get("h");
    expect(r.anchor.status).toBe("anchored");
    expect(r.anchor.txHash).toBe("TX1");
  });

  it("verify posts to /verify", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse(200, { receiptHash: "h", verified: true, proof: null })
    );
    const verix = clientWith(fetchImpl as unknown as typeof fetch);
    const v = await verix.receipts.verify("h");
    expect(v.verified).toBe(true);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.test/api/v1/receipts/h/verify");
    expect((fetchImpl.mock.calls[0][1] as RequestInit).method).toBe("POST");
  });

  describe("waitForAnchor", () => {
    it("returns immediately when already anchored", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(200, anchorBody("anchored")));
      const verix = clientWith(fetchImpl as unknown as typeof fetch);
      const anchor = await verix.receipts.waitForAnchor("h", { intervalMs: 5, timeoutMs: 100 });
      expect(anchor.status).toBe("anchored");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("polls until anchored", async () => {
      let n = 0;
      const fetchImpl = vi.fn(async () => {
        n += 1;
        return jsonResponse(200, anchorBody(n >= 3 ? "anchored" : "pending"));
      });
      const verix = clientWith(fetchImpl as unknown as typeof fetch);
      const anchor = await verix.receipts.waitForAnchor("h", { intervalMs: 5, timeoutMs: 1000 });
      expect(anchor.status).toBe("anchored");
      expect(n).toBeGreaterThanOrEqual(3);
    });

    it("throws anchor_timeout when never anchored", async () => {
      const verix = clientWith(async () => jsonResponse(200, anchorBody("pending")));
      await expect(
        verix.receipts.waitForAnchor("h", { intervalMs: 5, timeoutMs: 30 })
      ).rejects.toMatchObject({ code: "anchor_timeout" });
    });
  });
});
