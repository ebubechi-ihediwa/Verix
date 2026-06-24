import { NextRequest, NextResponse } from "next/server";
import { revokeSession } from "@/lib/session";
import { getSessionId, SESSION_COOKIE } from "@/lib/auth";

/**
 * POST /api/auth/logout
 * Revokes the current session (deletes the DB row) and clears the cookie.
 * Idempotent: returns { ok: true } even if no session was present.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = getSessionId(request);
  await revokeSession(token);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
