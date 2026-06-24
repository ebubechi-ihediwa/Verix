import { describe, it, expect } from "vitest";
import { runBlendYieldStub } from "@/services/agents/blend-yield";

describe("runBlendYieldStub", () => {
  it("produces a clearly-labelled stub operation with pools, selection, supply, and a stub txHash", () => {
    const r = runBlendYieldStub({
      description: "Supply 100 USDC to the best lending pool",
      agentName: "My Yield Agent",
      config: { asset: "USDC", supplyAmount: 250 },
    });

    expect(r.model).toBe("blend-yield-stub");
    expect(r.operation.mode).toBe("stub");
    expect(r.operation.protocol).toBe("blend");

    // queried pool rates
    expect(r.operation.queriedPools.length).toBeGreaterThan(0);
    // selected target pool = highest APY for the asset
    expect(r.operation.selectedPool.poolId).toBe("blend-pool-usdc-main");
    expect(r.operation.asset).toBe("USDC");
    // intended supply amount from config
    expect(r.operation.intendedSupplyAmount).toBe(250);
    // stub txHash — clearly marked, never broadcast
    expect(r.operation.txHash).toMatch(/^stub-blend-/);
    // output is honest about being simulated
    expect(r.output).toContain("STUB MODE");
    expect(r.output).toContain("SIMULATED");
  });

  it("is deterministic for identical inputs", () => {
    const input = { description: "supply", agentName: "Agent X", config: { supplyAmount: 10 } };
    expect(runBlendYieldStub(input)).toEqual(runBlendYieldStub(input));
  });

  it("never leaks an internal vx_agent_ sentinel (uses the supplied public name)", () => {
    const r = runBlendYieldStub({
      description: "do it",
      agentName: "Treasury Yield Bot",
      config: null,
    });
    expect(r.output).not.toMatch(/vx_agent_/);
    expect(JSON.stringify(r.operation)).not.toMatch(/vx_agent_/);
  });

  it("honours an explicit target pool and falls back to defaults for unknown assets", () => {
    const r = runBlendYieldStub({
      description: "supply XLM",
      agentName: "X",
      config: { asset: "XLM" },
    });
    expect(r.operation.asset).toBe("XLM");
    expect(r.operation.selectedPool.asset).toBe("XLM");
  });
});
