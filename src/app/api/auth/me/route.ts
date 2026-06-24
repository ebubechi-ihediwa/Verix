import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, toPublicUser } from "@/lib/session";
import { unauthorizedResponse } from "@/lib/auth";

/**
 * GET /api/auth/me
 * Returns the current authenticated user, or 401 if no valid session.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse("Authentication required");
  return NextResponse.json({ user: toPublicUser(user) });
}
