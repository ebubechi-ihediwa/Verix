import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { issueSession, toPublicUser } from "@/lib/session";
import { setSessionCookie } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/**
 * POST /api/auth/signup
 * Body: { email, password, displayName? }
 * Creates a developer account and issues a session cookie.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { email?: unknown; password?: unknown; displayName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const displayName =
    typeof body.displayName === "string" && body.displayName.trim().length > 0
      ? body.displayName.trim()
      : null;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 422 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 422 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: { email, passwordHash: hashPassword(password), displayName },
  });

  const { token } = await issueSession(user.id, request.headers.get("user-agent"));
  const response = NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
  setSessionCookie(response, token);
  return response;
}
