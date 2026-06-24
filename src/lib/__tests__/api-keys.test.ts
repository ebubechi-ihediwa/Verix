import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

vi.mock("@/lib/db", () => ({
  prisma: {
    projectApiKey: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { generateApiKey, hashApiKey, findProjectByApiKey } from "@/lib/api-keys";

const mockPrisma = prisma as unknown as {
  projectApiKey: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateApiKey", () => {
  it("produces a vx_test_ key for testnet", () => {
    const k = generateApiKey("testnet");
    expect(k.raw.startsWith("vx_test_")).toBe(true);
    expect(k.environment).toBe("test");
    expect(k.keyPrefix).toBe(k.raw.slice(0, 12));
    expect(k.keyPrefix.startsWith("vx_test_")).toBe(true);
    expect(k.last4).toBe(k.raw.slice(-4));
    expect(k.keyHash).toBe(createHash("sha256").update(k.raw).digest("hex"));
  });

  it("produces a vx_live_ key for mainnet", () => {
    const k = generateApiKey("mainnet");
    expect(k.raw.startsWith("vx_live_")).toBe(true);
    expect(k.environment).toBe("live");
  });

  it("generates a unique key each call", () => {
    expect(generateApiKey("testnet").raw).not.toBe(generateApiKey("testnet").raw);
  });

  it("never exposes the hash as the raw key", () => {
    const k = generateApiKey("testnet");
    expect(k.raw).not.toBe(k.keyHash);
  });
});

describe("hashApiKey", () => {
  it("is deterministic 64-char hex and input-sensitive", () => {
    expect(hashApiKey("vx_test_abc")).toBe(hashApiKey("vx_test_abc"));
    expect(hashApiKey("vx_test_abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey("vx_test_abc")).not.toBe(hashApiKey("vx_test_abd"));
  });
});

describe("findProjectByApiKey", () => {
  it("returns null for an empty key without hitting the DB", async () => {
    expect(await findProjectByApiKey("")).toBeNull();
    expect(mockPrisma.projectApiKey.findUnique).not.toHaveBeenCalled();
  });

  it("returns null for an unknown key", async () => {
    mockPrisma.projectApiKey.findUnique.mockResolvedValue(null);
    expect(await findProjectByApiKey("vx_test_unknown")).toBeNull();
    expect(mockPrisma.projectApiKey.update).not.toHaveBeenCalled();
  });

  it("rejects a revoked key (returns null, does not stamp usage)", async () => {
    mockPrisma.projectApiKey.findUnique.mockResolvedValue({
      id: "key_1",
      revokedAt: new Date("2026-01-01"),
      project: { id: "proj_1" },
    });
    expect(await findProjectByApiKey("vx_test_revoked")).toBeNull();
    expect(mockPrisma.projectApiKey.update).not.toHaveBeenCalled();
  });

  it("resolves a valid key to its project and looks up by hash", async () => {
    const project = { id: "proj_1", userId: "u1", name: "P" };
    mockPrisma.projectApiKey.findUnique.mockResolvedValue({
      id: "key_1",
      revokedAt: null,
      project,
    });
    mockPrisma.projectApiKey.update.mockResolvedValue({});

    const result = await findProjectByApiKey("vx_test_valid");
    expect(result).toEqual({ project, keyId: "key_1" });

    const where = mockPrisma.projectApiKey.findUnique.mock.calls[0][0].where;
    expect(where.keyHash).toBe(hashApiKey("vx_test_valid"));
  });

  it("stamps lastUsedAt on a valid lookup", async () => {
    mockPrisma.projectApiKey.findUnique.mockResolvedValue({
      id: "key_2",
      revokedAt: null,
      project: { id: "proj_2" },
    });
    mockPrisma.projectApiKey.update.mockResolvedValue({});

    await findProjectByApiKey("vx_test_valid2");
    expect(mockPrisma.projectApiKey.update).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.projectApiKey.update.mock.calls[0][0];
    expect(arg.where.id).toBe("key_2");
    expect(arg.data.lastUsedAt).toBeInstanceOf(Date);
  });
});
