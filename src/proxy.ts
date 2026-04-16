export { routeGuard as default } from "@/lib/route-guard";

export const config = {
  matcher: ["/admin/:path*", "/onboarding"],
};
