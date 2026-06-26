import { describe, it, expect, vi } from "vitest";
import { reconcileOrSubmit } from "@/services/protocols/reconcile";

describe("reconcileOrSubmit — never double-submit", () => {
  it("reuses an already-confirmed tx without resubmitting", async () => {
    const submit = vi.fn();
    const getStatus = vi.fn().mockResolvedValue("success");
    const r = await reconcileOrSubmit({ priorTxHash: "TXOLD", getStatus, submit });
    expect(r).toEqual({ txHash: "TXOLD", reconciled: true });
    expect(submit).not.toHaveBeenCalled();
  });

  it("reuses a still-pending tx without resubmitting", async () => {
    const submit = vi.fn();
    const r = await reconcileOrSubmit({
      priorTxHash: "TXP",
      getStatus: vi.fn().mockResolvedValue("pending"),
      submit,
    });
    expect(r).toEqual({ txHash: "TXP", reconciled: true });
    expect(submit).not.toHaveBeenCalled();
  });

  it("resubmits when the prior tx was not found (after a timeout)", async () => {
    const submit = vi.fn().mockResolvedValue({ txHash: "TXNEW" });
    const r = await reconcileOrSubmit({
      priorTxHash: "TXOLD",
      getStatus: vi.fn().mockResolvedValue("not_found"),
      submit,
    });
    expect(r).toEqual({ txHash: "TXNEW", reconciled: false });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("resubmits when the prior tx failed", async () => {
    const submit = vi.fn().mockResolvedValue({ txHash: "TXNEW" });
    const r = await reconcileOrSubmit({
      priorTxHash: "TXOLD",
      getStatus: vi.fn().mockResolvedValue("failed"),
      submit,
    });
    expect(r.reconciled).toBe(false);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("submits directly when there is no prior tx", async () => {
    const submit = vi.fn().mockResolvedValue({ txHash: "TX1" });
    const getStatus = vi.fn();
    const r = await reconcileOrSubmit({ priorTxHash: null, getStatus, submit });
    expect(r).toEqual({ txHash: "TX1", reconciled: false });
    expect(getStatus).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
