/**
 * Next.js 16 proxy — route protection.
 * Protects /admin and /onboarding — redirects unauthenticated users to /login.
 * Also redirects authenticated users without a username to /onboarding.
 * Rate-limits public card browsing at /cards and /sets before rendering begins.
 *
 * Runs on the Node.js runtime (the only runtime supported by proxy)
 * because @/auth imports PrismaAdapter/bcryptjs, which are not Edge-compatible.
 */
import { auth } from "@/auth";
import {
  consumePublicCardBrowseRateLimit,
  PUBLIC_CARD_BROWSE_RATE_LIMIT_HEADER,
} from "@/lib/cards/public-rate-limit";
import type { NextAuthRequest } from "next-auth";
import { NextResponse } from "next/server";

const PUBLIC_CARD_BROWSE_PATHS = new Set(["/cards", "/sets"]);
const PUBLIC_CARD_BROWSE_RETRY_AFTER_SECONDS = 60;

export async function handleProxyRequest(req: NextAuthRequest) {
  if (PUBLIC_CARD_BROWSE_PATHS.has(req.nextUrl.pathname)) {
    const { limited } = await consumePublicCardBrowseRateLimit(req.headers);
    if (limited) {
      return new Response("Too many requests. Please try again soon.", {
        status: 429,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Retry-After": String(PUBLIC_CARD_BROWSE_RETRY_AFTER_SECONDS),
        },
      });
    }

    const requestHeaders = new Headers(req.headers);
    requestHeaders.set(PUBLIC_CARD_BROWSE_RATE_LIMIT_HEADER, "allowed");
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const isAdmin = req.nextUrl.pathname.startsWith("/admin");
  const isOnboarding = req.nextUrl.pathname === "/onboarding";

  // Protect admin and onboarding routes — redirect to login if not authenticated
  if ((isAdmin || isOnboarding) && !req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return Response.redirect(loginUrl);
  }

  // If authenticated but no username set, redirect to onboarding
  // (except if already on onboarding page)
  if (req.auth && !req.auth.user.username && !isOnboarding && isAdmin) {
    return Response.redirect(new URL("/onboarding", req.nextUrl.origin));
  }
}

export default auth(handleProxyRequest);

export const config = {
  matcher: ["/admin/:path*", "/onboarding", "/cards", "/sets"],
};
