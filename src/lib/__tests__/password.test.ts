import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../password";

describe("hashPassword", () => {
  it("produces the scrypt:salt:hash format", () => {
    const stored = hashPassword("correct horse battery staple");
    const parts = stored.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("scrypt");
    expect(parts[1]).toMatch(/^[0-9a-f]+$/); // salt hex
    expect(parts[2]).toMatch(/^[0-9a-f]+$/); // hash hex
  });

  it("uses a fresh random salt each call — same password hashes differently", () => {
    const a = hashPassword("samePassword123");
    const b = hashPassword("samePassword123");
    expect(a).not.toBe(b);
  });

  it("never stores the plaintext password", () => {
    const stored = hashPassword("supersecret");
    expect(stored).not.toContain("supersecret");
  });
});

describe("verifyPassword", () => {
  it("returns true for the correct password", () => {
    const stored = hashPassword("hunter2hunter2");
    expect(verifyPassword("hunter2hunter2", stored)).toBe(true);
  });

  it("returns false for an incorrect password", () => {
    const stored = hashPassword("hunter2hunter2");
    expect(verifyPassword("wrongpassword", stored)).toBe(false);
  });

  it("is case- and whitespace-sensitive", () => {
    const stored = hashPassword("Password123");
    expect(verifyPassword("password123", stored)).toBe(false);
    expect(verifyPassword("Password123 ", stored)).toBe(false);
  });

  it("round-trips unicode and long passwords", () => {
    for (const pw of ["pâsswörd-✓-😀", "x".repeat(512), "a b c d e f"]) {
      expect(verifyPassword(pw, hashPassword(pw))).toBe(true);
    }
  });

  it("returns false (does not throw) for malformed stored values", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "notascryptstring")).toBe(false);
    expect(verifyPassword("x", "scrypt:onlytwo")).toBe(false);
    expect(verifyPassword("x", "bcrypt:abcd:ef12")).toBe(false);
    expect(verifyPassword("x", "scrypt::")).toBe(false);
    // @ts-expect-error — exercise non-string input guard
    expect(verifyPassword("x", null)).toBe(false);
  });
});
