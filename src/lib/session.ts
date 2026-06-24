import { randomBytes, createHash } from "crypto";
import type { NextRequest } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionId } from "@/lib/auth";

/**
 * Server-side, DB-backed sessions.
 *
 * The raw session token is generated here, returned to the caller (set into the
 * httpOnly `asn_session` cookie via lib/auth.setSessionCookie), and never stored.
 * The DB stores only sha256(token) as Session.tokenHash for lookup, so a DB leak
 * does not expose live session tokens. Sessions are revocable and expire.
 *
 * Pure helpers (generateSessionToken / hashSessionToken / sessionExpiry) are
 * separated from DB operations so they can be unit-tested without a database.
 */

/** Session lifetime in days. Matches the 30-day cookie maxAge in lib/auth. */
export const SESSION_TTL_DAYS = 30;

const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Generate a new opaque session token (192 bits, url-safe). */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Deterministic lookup hash for a raw token. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Compute the expiry timestamp for a session created at `from` (default now). */
export function sessionExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + SESSION_TTL_MS);
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

/** Public-safe projection of a user — never includes passwordHash. */
export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
}

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, displayName: user.displayName ?? null };
}

// ── DB operations ────────────────────────────────────────────────────────────

/**
 * Create a session row for `userId` and return the raw token + expiry.
 * The raw token is what the caller stores in the cookie; only its hash is persisted.
 */
export async function issueSession(
  userId: string,
  userAgent?: string | null
): Promise<IssuedSession> {
  const token = generateSessionToken();
  const expiresAt = sessionExpiry();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      userAgent: userAgent ?? null,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

/**
 * Resolve a raw session token to its User, or null if the token is missing,
 * unknown, or expired.
 */
export async function getUserBySessionToken(token: string | null): Promise<User | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  return session.user;
}

/** Resolve the current user from a request's session cookie/header. */
export async function getCurrentUser(request: NextRequest): Promise<User | null> {
  return getUserBySessionToken(getSessionId(request));
}

/** Thrown by requireUser when no valid session is present. */
export class UnauthorizedError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Resolve the current user or throw UnauthorizedError. Route handlers catch this
 * and map it to a 401 (see unauthorizedResponse in lib/auth).
 */
export async function requireUser(request: NextRequest): Promise<User> {
  const user = await getCurrentUser(request);
  if (!user) throw new UnauthorizedError();
  return user;
}

/**
 * Revoke a session by its raw token. Returns true if a session was deleted.
 * deleteMany is used so revoking an already-gone token is a no-op (not an error).
 */
export async function revokeSession(token: string | null): Promise<boolean> {
  if (!token) return false;
  const result = await prisma.session.deleteMany({
    where: { tokenHash: hashSessionToken(token) },
  });
  return result.count > 0;
}
