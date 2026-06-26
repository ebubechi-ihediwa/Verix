import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/agents/blend", () => ({
  executeBlendSupply: vi.fn(async () => ({
    status: "CONFIRMED", txHash: "TXS", operation: { protocol: "blend", operation: "supply" }, output: "s", timeline: {},
  })),
  executeBlendWithdraw: vi.fn(async () => ({
    status: "CONFIRMED", txHash: "TXW", operation: { protocol: "blend", operation: "withdraw" }, output: "w", timeline: {},
  })),
  resumeBlendOperation: vi.fn(async () => ({
    status: "CONFIRMED", txHash: "TXR", operation: { protocol: "blend", operation: "supply" }, output: "r", timeline: {},
  })),
  resolveSigningMode: vi.fn(() => "server"),
  resolveBlendNetwork: vi.fn(() => "testnet"),
  getPoolAllowlist: vi.fn(() => [{ asset: "USDC", poolId: "C", name: "USDC Pool" }]),
  getAssetContractId: vi.fn(() => "CUSDC"),
}));

import { executeBlendSupply, executeBlendWithdraw } from "@/services/agents/blend";
import { blendAdapter } from "@/services/protocols/blend-adapter";
import { getProtocolAdapter, requireProtocolAdapter, listProtocols } from "@/services/protocols/registry";

const req = {
  taskId: "t", subtaskId: "s", agentName: "a", asset: "USDC", amount: 100, spendCap: 1000, network: "testnet" as const,
};

beforeEach(() => vi.clearAllMocks());

describe("ProtocolAdapter contract — Blend", () => {
  it("declares protocol id + supported operations", () => {
    expect(blendAdapter.protocol).toBe("blend");
    expect(blendAdapter.operations).toEqual(["supply", "withdraw"]);
    expect(blendAdapter.supports("supply")).toBe(true);
    expect(blendAdapter.supports("withdraw")).toBe(true);
    expect(blendAdapter.supports("borrow")).toBe(false);
  });

  it("routes execute() to supply / withdraw", async () => {
    const s = await blendAdapter.execute({ ...req, operation: "supply" });
    expect(executeBlendSupply).toHaveBeenCalledTimes(1);
    expect(s.status).toBe("CONFIRMED");
    expect(s.operation?.operation).toBe("supply");

    const w = await blendAdapter.execute({ ...req, operation: "withdraw" });
    expect(executeBlendWithdraw).toHaveBeenCalledTimes(1);
    expect(w.operation?.operation).toBe("withdraw");
  });

  it("is resolvable from the registry", () => {
    expect(getProtocolAdapter("blend")).toBe(blendAdapter);
    expect(requireProtocolAdapter("blend").protocol).toBe("blend");
    expect(getProtocolAdapter("nope")).toBeUndefined();
    expect(() => requireProtocolAdapter("nope")).toThrow();
    expect(listProtocols()).toContain("blend");
  });

  it("produces structured diagnostics", async () => {
    const d = await blendAdapter.diagnose();
    expect(d.protocol).toBe("blend");
    expect(d.network).toBe("testnet");
    expect(d.signingMode).toBe("server");
    expect(Array.isArray(d.checks)).toBe(true);
    expect(typeof d.ready).toBe("boolean");
  });
});
