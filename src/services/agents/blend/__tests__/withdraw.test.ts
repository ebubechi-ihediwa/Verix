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
vi.mock("@/lib/wallet", () => ({ getStellarWalletBalanceInfo: vi.fn().mockResolvedValue({ balance: "1000" }) }));
vi.mock("@/services/agents/blend/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/agents/blend/config")>();
  return { ...actual, getAssetContractId: vi.fn(() => "CUSDC_SAC_TEST") };
});

import { recordTraceEvent } from "@/services/trace";
import { submitPoolRequest, confirmTransaction, loadUserPosition } from "@/services/agents/blend/client";
import { executeBlendWithdraw, executeBlendSupply, BlendWithdrawError } from "@/services/agents/blend";

const mockTrace = recordTraceEvent as unknown as ReturnType<typeof vi.fn>;
const mockSubmit = submitPoolRequest as unknown as ReturnType<typeof vi.fn>;
const mockConfirm = confirmTransaction as unknown as ReturnType<typeof vi.fn>;
const mockPosition = loadUserPosition as unknown as ReturnType<typeof vi.fn>;

const BASE = { taskId: "t1", subtaskId: "s1", agentName: "Yield Bot", asset: "USDC", network: "testnet" as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
  mockSubmit.mockResolvedValue({ txHash: "TX" });
  mockConfirm.mockResolvedValue({ confirmed: true });
  mockPosition.mockResolvedValue({ deposited: 500, borrow: 0, withdrawable: 500 });
});
afterEach(() => vi.unstubAllGlobals());

describe("executeBlendWithdraw", () => {
  it("withdraws a real amount and returns the operation (no spend-cap consumption)", async () => {
    // spendCap is deliberately tiny — withdraw must NOT enforce it.
    const res = await executeBlendWithdraw({ ...BASE, amount: 200, spendCap: 1 });

    expect(res.status).toBe("CONFIRMED");
    expect(res.operation).toMatchObject({ protocol: "blend", operation: "withdraw", asset: "USDC", amount: 200, txHash: "TX" });
    expect(mockSubmit.mock.calls[0][0].requestType).toBe(1); // withdraw
    expect(mockSubmit.mock.calls[0][0].amountRaw).toBe(BigInt(2_000_000_000)); // 200 * 1e7
  });

  it("resolves amount='max' to the full withdrawable position", async () => {
    mockPosition.mockResolvedValue({ deposited: 350, borrow: 0, withdrawable: 350 });
    const res = await executeBlendWithdraw({ ...BASE, amount: "max", spendCap: 1000 });
    expect(res.operation?.amount).toBe(350);
    expect(mockSubmit.mock.calls[0][0].amountRaw).toBe(BigInt(3_500_000_000));
  });

  it("rejects an over-withdraw beyond the position", async () => {
    mockPosition.mockResolvedValue({ deposited: 100, borrow: 0, withdrawable: 100 });
    await expect(executeBlendWithdraw({ ...BASE, amount: 500, spendCap: 1000 })).rejects.toMatchObject({
      code: "insufficient_position",
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("rejects when there is no position (max → 0)", async () => {
    mockPosition.mockResolvedValue({ deposited: 0, borrow: 0, withdrawable: 0 });
    await expect(executeBlendWithdraw({ ...BASE, amount: "max", spendCap: 1000 })).rejects.toBeInstanceOf(
      BlendWithdrawError
    );
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("records the withdraw trace with the confirmed txHash", async () => {
    await executeBlendWithdraw({ ...BASE, amount: 200, spendCap: 1000 });
    const types = mockTrace.mock.calls.map((c) => c[1]);
    expect(types).toEqual(
      expect.arrayContaining(["blend_withdraw_initiated", "blend_tx_submitted", "blend_withdraw_confirmed"])
    );
    const confirmCall = mockTrace.mock.calls.find((c) => c[1] === "blend_withdraw_confirmed");
    expect(confirmCall?.[4].metadata.txHash).toBe("TX");
  });
});

describe("shared operation engine", () => {
  it("supply and withdraw both route through the same submit + confirm path", async () => {
    await executeBlendSupply({ ...BASE, amount: 100, spendCap: 1000 });
    await executeBlendWithdraw({ ...BASE, amount: 100, spendCap: 1000 });

    expect(mockSubmit).toHaveBeenCalledTimes(2);
    expect(mockConfirm).toHaveBeenCalledTimes(2);
    const reqTypes = mockSubmit.mock.calls.map((c) => c[0].requestType).sort();
    expect(reqTypes).toEqual([0, 1]); // supply (0) + withdraw (1)
  });
});
