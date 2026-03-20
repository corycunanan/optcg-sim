/**
 * GET /api/game/token — Returns the caller's raw NextAuth JWT string.
 * The game board client fetches this once and passes it to the WebSocket
 * connection as `?token=<jwt>`, where the Cloudflare DO verifies the signature.
 */

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    raw: true, // return the signed JWT string, not the decoded payload
  });

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ token });
}
