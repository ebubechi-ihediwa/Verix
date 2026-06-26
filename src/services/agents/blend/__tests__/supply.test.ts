import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/services/trace", () => ({ recordTraceEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/services/agents/blend/client", () => ({
  REQUEST_TYPE_SUPPLY: 0,
  REQUEST_TYPE_WITHDRAW: 1,
  submitPoolRequest: vi.fn(),
  buildPoolRequestXdr: vi.fn(),
  submitSignedXdr: vi.fn(),
  getTransactionStatus: vi.fn(),
  confirmTransaction: vi.fn(),
  loadUserPosition: vi.fn(),
}));
vi.mock("@/services/agents/blend/signing", () => ({
  resolveSigningMode: vi.fn(() => "server"),
  resolveServerSigner: vi.fn(() => ({ publicKey: "G" + "A".repeat(55), secret: "S" + "B".repeat(55) })),
}));
vi.mock("@/lib/wallet", () => ({ getStellarWalletBalanceInfo: vi.fn() }));
// Keep config real except the asset SAC id (no testnet default in the allowlist).
vi.mock("@/services/agents/blend/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/agents/blend/config")>();
  return { ...actual, getAssetContractId: vi.fn(() => "CUSDC_SAC_TEST") };
});

import { recordTraceEvent } from "@/services/trace";
import { submitPoolRequest, confirmTransaction } from "@/services/agents/blend/client";
import { getStellarWalletBalanceInfo } from "@/lib/wallet";
import { executeBlendSupply, BlendSupplyError } from "@/services/agents/blend";

const mockTrace = recordTraceEvent as unknown as ReturnType<typeof vi.fn>;
const mockSubmit = submitPoolRequest as unknown as ReturnType<typeof vi.fn>;
const mockConfirm = confirmTransaction as unknown as ReturnType<typeof vi.fn>;
const mockBalance = getStellarWalletBalanceInfo as unknown as ReturnType<typeof vi.fn>;

const BASE = { taskId: "t1", subtaskId: "s1", agentName: "Yield Bot", asset: "USDC", network: "testnet" as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); })); // discovery → mock pools
  mockBalance.mockResolvedValue({ balance: "1000" });
  mockSubmit.mockResolvedValue({ txHash: "TX" });
  mockConfirm.mockResolvedValue({ confirmed: true });
});
afterEach(() => vi.unstubAllGlobals());

describe("executeBlendSupply", () => {
  it("executes a supply via the shared engine, scaling the amount and returning the operation", async () => {
    const res = await executeBlendSupply({ ...BASE, amount: 250, spendCap: 1000 });

    expect(res.status).toBe("CONFIRMED");
    expect(res.txHash).toBe("TX");
    expect(res.operation).toMatchObject({
      protocol: "blend",
      operation: "supply",
      asset: "USDC",
      amount: 250,
      txHash: "TX",
    });

    const submitArg = mockSubmit.mock.calls[0][0];
    expect(submitArg.requestType).toBe(0); // supply
    expect(submitArg.amountRaw).toBe(BigInt(2_500_000_000)); // 250 * 1e7

    const types = mockTrace.mock.calls.map((c) => c[1]);
    expect(types).toEqual(
      expect.arrayContaining([
        "blend_rate_check",
        "blend_pool_selected",
        "blend_supply_initiated",
        "blend_tx_submitted",
        "blend_supply_confirmed",
      ])
    );
    const confirmCall = mockTrace.mock.calls.find((c) => c[1] === "blend_supply_confirmed");
    expect(confirmCall?.[4].metadata.txHash).toBe("TX");
  });

  it("enforces the spend cap before signing", async () => {
    await expect(executeBlendSupply({ ...BASE, amount: 5000, spendCap: 1000 })).rejects.toMatchObject({
      code: "spend_cap_exceeded",
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("fails on insufficient balance before signing", async () => {
    mockBalance.mockResolvedValue({ balance: "10" });
    await expect(executeBlendSupply({ ...BASE, amount: 250, spendCap: 1000 })).rejects.toBeInstanceOf(
      BlendSupplyError
    );
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("rejects amount='max' for supply", async () => {
    await expect(executeBlendSupply({ ...BASE, amount: "max", spendCap: 1000 })).rejects.toMatchObject({
      code: "validation_error",
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("fails when the transaction does not confirm", async () => {
    mockConfirm.mockResolvedValue({ confirmed: false });
    await expect(executeBlendSupply({ ...BASE, amount: 250, spendCap: 1000 })).rejects.toMatchObject({
      code: "tx_not_confirmed",
    });
  });
});
