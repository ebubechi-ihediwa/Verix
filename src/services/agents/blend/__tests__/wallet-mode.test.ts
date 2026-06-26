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
  resolveSigningMode: vi.fn(() => "wallet"),
  resolveServerSigner: vi.fn(() => {
    throw new Error("server signer should not be used in wallet mode");
  }),
}));
vi.mock("@/lib/wallet", () => ({
  getStellarWalletBalanceInfo: vi.fn().mockResolvedValue({ balance: "1000" }),
}));
vi.mock("@/services/agents/blend/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/agents/blend/config")>();
  return { ...actual, getAssetContractId: vi.fn(() => "CUSDC_SAC_TEST") };
});

import {
  buildPoolRequestXdr,
  submitSignedXdr,
  confirmTransaction,
} from "@/services/agents/blend/client";
import { executeBlendSupply, resumeBlendOperation } from "@/services/agents/blend";

const mockBuild = buildPoolRequestXdr as unknown as ReturnType<typeof vi.fn>;
const mockSubmitSigned = submitSignedXdr as unknown as ReturnType<typeof vi.fn>;
const mockConfirm = confirmTransaction as unknown as ReturnType<typeof vi.fn>;

const WALLET = "G" + "C".repeat(55);
const BASE = { taskId: "t1", subtaskId: "s1", agentName: "Yield Bot", asset: "USDC", network: "testnet" as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
  mockBuild.mockResolvedValue({ unsignedXdr: "XDR_UNSIGNED" });
  mockSubmitSigned.mockResolvedValue({ txHash: "TXSIGNED" });
  mockConfirm.mockResolvedValue({ confirmed: true });
});
afterEach(() => vi.unstubAllGlobals());

describe("wallet-mode signing", () => {
  it("builds an unsigned XDR and returns AWAITING_SIGNATURE without submitting", async () => {
    const res = await executeBlendSupply({ ...BASE, amount: 100, spendCap: 1000, sourceWallet: WALLET });

    expect(res.status).toBe("AWAITING_SIGNATURE");
    expect(res.unsignedXdr).toBe("XDR_UNSIGNED");
    expect(res.operation).toBeUndefined();
    expect(mockBuild).toHaveBeenCalledTimes(1);
    expect(mockBuild.mock.calls[0][0].from).toBe(WALLET);
    expect(mockSubmitSigned).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
    // timeline stops at simulate (no submit/confirm yet)
    expect(res.timeline.simulatedAt).toBeTruthy();
    expect(res.timeline.submittedAt).toBeUndefined();
  });

  it("requires a sourceWallet in wallet mode", async () => {
    await expect(
      executeBlendSupply({ ...BASE, amount: 100, spendCap: 1000 })
    ).rejects.toMatchObject({ code: "signing_unavailable" });
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it("resumes by submitting the signed XDR and confirming (ordered timeline)", async () => {
    const res = await resumeBlendOperation({
      taskId: "t1", subtaskId: "s1", agentName: "Yield Bot",
      operation: "supply", asset: "USDC", network: "testnet",
      signedXdr: "XDR_SIGNED", poolId: "CUSDCPOOL", amount: 100, apy: 0.0524,
    });

    expect(res.status).toBe("CONFIRMED");
    expect(res.txHash).toBe("TXSIGNED");
    expect(mockSubmitSigned).toHaveBeenCalledWith("XDR_SIGNED");
    expect(res.operation?.operation).toBe("supply");
    expect(res.timeline.confirmedAt).toBeTruthy();
    expect(res.timeline.submittedAt! <= res.timeline.confirmedAt!).toBe(true);
  });
});
