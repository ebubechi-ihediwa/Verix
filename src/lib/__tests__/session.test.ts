import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma client so session DB operations are exercised without a database.
vi.mock("@/lib/db", () => ({
  prisma: {
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import {
  generateSessionToken,
  hashSessionToken,
  sessionExpiry,
  issueSession,
  getUserBySessionToken,
  revokeSession,
  SESSION_TTL_DAYS,
} from "@/lib/session";

const mockPrisma = prisma as unknown as {
  session: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pure helpers", () => {
  it("generateSessionToken returns distinct url-safe tokens", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it("hashSessionToken is deterministic 64-char hex and input-sensitive", () => {
    expect(hashSessionToken("tok")).toBe(hashSessionToken("tok"));
    expect(hashSessionToken("tok")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken("tok")).not.toBe(hashSessionToken("tok2"));
  });

  it("sessionExpiry is SESSION_TTL_DAYS in the future", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const exp = sessionExpiry(from);
    const expectedMs = from.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
    expect(exp.getTime()).toBe(expectedMs);
  });
});

describe("issueSession (creation)", () => {
  it("persists only the token hash and returns the raw token", async () => {
    mockPrisma.session.create.mockResolvedValue({});
    const { token, expiresAt } = await issueSession("user_1", "vitest-agent");

    expect(mockPrisma.session.create).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.session.create.mock.calls[0][0];
    expect(arg.data.userId).toBe("user_1");
    expect(arg.data.userAgent).toBe("vitest-agent");
    // The stored hash must equal sha256(rawToken); the raw token is never stored.
    expect(arg.data.tokenHash).toBe(hashSessionToken(token));
    expect(arg.data.tokenHash).not.toBe(token);
    expect(arg.data.expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("defaults userAgent to null when omitted", async () => {
    mockPrisma.session.create.mockResolvedValue({});
    await issueSession("user_2");
    expect(mockPrisma.session.create.mock.calls[0][0].data.userAgent).toBeNull();
  });
});

describe("getUserBySessionToken (lookup)", () => {
  it("returns null for a missing token without hitting the DB", async () => {
    const user = await getUserBySessionToken(null);
    expect(user).toBeNull();
    expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
  });

  it("returns null for an unknown token", async () => {
    mockPrisma.session.findUnique.mockResolvedValue(null);
    expect(await getUserBySessionToken("nope")).toBeNull();
  });

  it("looks up by the hashed token, not the raw token", async () => {
    mockPrisma.session.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: "u1", email: "a@b.com", displayName: null },
    });
    await getUserBySessionToken("raw-token");
    const where = mockPrisma.session.findUnique.mock.calls[0][0].where;
    expect(where.tokenHash).toBe(hashSessionToken("raw-token"));
  });

  it("returns the user for a valid, unexpired session", async () => {
    const user = { id: "u1", email: "a@b.com", displayName: "Dev" };
    mockPrisma.session.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      user,
    });
    expect(await getUserBySessionToken("valid")).toEqual(user);
  });

  it("returns null for an expired session", async () => {
    mockPrisma.session.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() - 1_000),
      user: { id: "u1", email: "a@b.com", displayName: null },
    });
    expect(await getUserBySessionToken("expired")).toBeNull();
  });
});

describe("revokeSession (revocation)", () => {
  it("returns false for a missing token without hitting the DB", async () => {
    expect(await revokeSession(null)).toBe(false);
    expect(mockPrisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes by hashed token and returns true when a row was removed", async () => {
    mockPrisma.session.deleteMany.mockResolvedValue({ count: 1 });
    expect(await revokeSession("raw")).toBe(true);
    const where = mockPrisma.session.deleteMany.mock.calls[0][0].where;
    expect(where.tokenHash).toBe(hashSessionToken("raw"));
  });

  it("returns false when no session matched (idempotent)", async () => {
    mockPrisma.session.deleteMany.mockResolvedValue({ count: 0 });
    expect(await revokeSession("gone")).toBe(false);
  });
});
