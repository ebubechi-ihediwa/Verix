import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/discovery", () => ({
  getSpecialistById: vi.fn(),
  getSpecialistByName: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: { payment: { upsert: vi.fn() } } }));
vi.mock("@/lib/wallet", () => ({ getCoordinatorAddress: () => "G" + "C".repeat(55) }));

import { getSpecialistById, getSpecialistByName } from "@/services/discovery";
import { createPayment } from "@/services/payment";

const mockById = getSpecialistById as unknown as ReturnType<typeof vi.fn>;
const mockByName = getSpecialistByName as unknown as ReturnType<typeof vi.fn>;

const WALLET_A = "G" + "A".repeat(55);
const WALLET_B = "G" + "B".repeat(55);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createPayment — ID-safe wallet resolution", () => {
  it("pays the selected agent's wallet by ID, ignoring a same-name collision", async () => {
    // Project A and Project B both have an agent whose public name is "Yield Bot".
    mockById.mockImplementation((id: string) =>
      Promise.resolve(
        id === "agent_A"
          ? { id: "agent_A", walletAddress: WALLET_A }
          : { id: "agent_B", walletAddress: WALLET_B }
      )
    );
    // Name lookup would resolve to the OTHER project's agent (the collision).
    mockByName.mockResolvedValue({ id: "agent_B", walletAddress: WALLET_B });

    const payment = await createPayment("task_1", "Yield Bot", 1.5, "agent_A");

    // Resolved by ID → Project A's wallet, NOT the colliding Project B wallet.
    expect(payment.to).toBe(WALLET_A);
    expect(payment.to).not.toBe(WALLET_B);
    expect(payment.status).toBe("confirmed");
    expect(mockById).toHaveBeenCalledWith("agent_A");
  });

  it("falls back to name resolution for legacy/unpinned subtasks (no specialistId)", async () => {
    mockByName.mockResolvedValue({ id: "seed_codeauditor", walletAddress: WALLET_A });

    const payment = await createPayment("task_1", "CodeAuditor", 1.0);

    expect(mockById).not.toHaveBeenCalled();
    expect(mockByName).toHaveBeenCalledWith("CodeAuditor");
    expect(payment.to).toBe(WALLET_A);
    expect(payment.status).toBe("confirmed");
  });

  it("falls back to name when the supplied specialistId is stale/not found", async () => {
    mockById.mockResolvedValue(undefined);
    mockByName.mockResolvedValue({ id: "seed", walletAddress: WALLET_B });

    const payment = await createPayment("task_1", "Yield Bot", 2.0, "missing_id");

    expect(mockById).toHaveBeenCalledWith("missing_id");
    expect(mockByName).toHaveBeenCalledWith("Yield Bot");
    expect(payment.to).toBe(WALLET_B);
  });
});
