import { auth } from "@/auth";

export const proxy = auth((req) => {
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
