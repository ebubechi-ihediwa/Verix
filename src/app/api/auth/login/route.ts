import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { issueSession, toPublicUser } from "@/lib/session";
import { setSessionCookie } from "@/lib/auth";

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Authenticates and issues a session cookie. Returns a generic 401 on failure
 * (no user enumeration — same response whether the email or password is wrong).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const invalid = () =>
    NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  if (!email || !password) return invalid();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return invalid();
  }

  const { token } = await issueSession(user.id, request.headers.get("user-agent"));
  const response = NextResponse.json({ user: toPublicUser(user) });
  setSessionCookie(response, token);
  return response;
}
