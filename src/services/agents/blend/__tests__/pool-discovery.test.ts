import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Keep trace recording in-memory; discovery must run offline (mock fallback).
vi.mock("@/services/trace", () => ({
  recordTraceEvent: vi.fn().mockResolvedValue(undefined),
}));

import { recordTraceEvent } from "@/services/trace";
import { getPools, selectBestPool } from "@/services/agents/blend/pool-discovery";
import { runBlendDiscovery, BlendDiscoveryError } from "@/services/agents/blend";
import type { BlendPool } from "@/services/agents/blend/types";

const mockTrace = recordTraceEvent as unknown as ReturnType<typeof vi.fn>;

function usdcPool(apy: number, poolId = "CUSDCPOOL"): BlendPool {
  return {
    poolId,
    asset: "USDC",
    name: "USDC Pool",
    apy,
    liquidity: 1000,
    utilization: 0.5,
    reserve: { totalSupply: 1000, totalBorrow: 500, availableLiquidity: 500 },
    source: "mock",
    fetchedAt: "2026-06-15T00:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Force the live Blend API offline so getPools uses the deterministic mock.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("offline");
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("getPools", () => {
  it("discovers allowlisted pools (deterministic mock fallback when offline)", async () => {
    const pools = await getPools({ asset: "USDC" });
    expect(pools.length).toBeGreaterThan(0);
    expect(pools[0].asset).toBe("USDC");
    expect(pools[0].source).toBe("mock");
    expect(pools[0].apy).toBeGreaterThan(0);
    expect(pools[0].reserve.availableLiquidity).toBeGreaterThanOrEqual(0);
  });

  it("returns the full allowlist sorted by APY descending", async () => {
    const pools = await getPools();
    expect(pools.length).toBeGreaterThanOrEqual(2); // testnet defaults: USDC + XLM
    for (let i = 1; i < pools.length; i++) {
      expect(pools[i - 1].apy).toBeGreaterThanOrEqual(pools[i].apy);
    }
  });
});

describe("selectBestPool", () => {
  it("selects the highest-APY pool for the asset", () => {
    const res = selectBestPool(
      [usdcPool(0.04, "A"), usdcPool(0.07, "B"), usdcPool(0.05, "C")],
      { asset: "USDC" }
    );
    expect(res.selected?.poolId).toBe("B");
    expect(res.selected?.apy).toBe(0.07);
  });

  it("rejects an unsupported asset", () => {
    const res = selectBestPool([], { asset: "DOGE" });
    expect(res.selected).toBeNull();
    expect(res.reason).toBe("unsupported_asset");
  });

  it("respects minApy — gate fails", () => {
    const res = selectBestPool([usdcPool(0.0524)], { asset: "USDC", minApy: 0.99 });
    expect(res.selected).toBeNull();
    expect(res.reason).toBe("apy_below_minimum");
    expect(res.bestConsidered?.apy).toBe(0.0524);
  });

  it("respects minApy — gate passes", () => {
    const res = selectBestPool([usdcPool(0.0524)], { asset: "USDC", minApy: 0.01 });
    expect(res.selected?.apy).toBe(0.0524);
  });

  it("returns no_pools_available for a supported asset with no pools", () => {
    const res = selectBestPool([], { asset: "USDC" });
    expect(res.reason).toBe("no_pools_available");
  });
});

describe("runBlendDiscovery", () => {
  it("discovers, selects, and records pool-selection trace (no tx)", async () => {
    const result = await runBlendDiscovery({
      taskId: "t1",
      subtaskId: "s1",
      agentName: "Yield Bot",
      config: { asset: "USDC", minApy: 0.01 },
    });

    expect(result.selected.asset).toBe("USDC");
    expect(result.output).toContain("DISCOVERY ONLY");
    expect(result.model).toBe("blend-discovery");

    const types = mockTrace.mock.calls.map((c) => c[1]);
    expect(types).toContain("blend_rate_check");
    expect(types).toContain("blend_pool_selected");

    const selectionCall = mockTrace.mock.calls.find((c) => c[1] === "blend_pool_selected");
    expect(selectionCall?.[3]).toMatch(/Selected Blend pool/);
    expect(selectionCall?.[4].metadata.poolId).toBe(result.selected.poolId);
    expect(selectionCall?.[4].metadata.apy).toBe(result.selected.apy);
  });

  it("throws BlendDiscoveryError when no pool qualifies (minApy too high)", async () => {
    await expect(
      runBlendDiscovery({ taskId: "t1", subtaskId: "s1", agentName: "Bot", config: { asset: "USDC", minApy: 0.99 } })
    ).rejects.toBeInstanceOf(BlendDiscoveryError);
  });

  it("throws for an unsupported asset (with reason)", async () => {
    await expect(
      runBlendDiscovery({ taskId: "t1", subtaskId: "s1", agentName: "Bot", config: { asset: "DOGE" } })
    ).rejects.toMatchObject({ reason: "unsupported_asset" });
  });
});
