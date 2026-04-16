/**
 * Next.js 16 proxy — route protection.
 * Protects /admin and /onboarding — redirects unauthenticated users to /login.
 * Also redirects authenticated users without a username to /onboarding.
 *
 * Runs on the Node.js runtime (the only runtime supported by proxy)
 * because @/auth imports PrismaAdapter/bcryptjs, which are not Edge-compatible.
 */
import { auth } from "@/auth";

export default auth((req) => {
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
});

export const config = {
  matcher: ["/admin/:path*", "/onboarding"],
};
