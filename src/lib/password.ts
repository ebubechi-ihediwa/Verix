import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Password hashing using Node's native scrypt (no external dependency).
 *
 * Stored format: "scrypt:<saltHex>:<hashHex>" — mirrors the ":"-delimited
 * convention used by lib/encryption.ts. Raw passwords are never stored or logged.
 */

const SCHEME = "scrypt";
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

/** Hash a plaintext password. Returns "scrypt:<saltHex>:<hashHex>". */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(plain, salt, KEY_LENGTH);
  return `${SCHEME}:${salt.toString("hex")}:${derived.toString("hex")}`;
}

/**
 * Verify a plaintext password against a stored "scrypt:salt:hash" string.
 * Returns false for malformed input rather than throwing. Uses a constant-time
 * comparison to avoid timing leaks.
 */
export function verifyPassword(plain: string, stored: string): boolean {
  if (typeof stored !== "string") return false;
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== SCHEME || !saltHex || !hashHex) return false;

  let expected: Buffer;
  let salt: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = scryptSync(plain, salt, expected.length);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
