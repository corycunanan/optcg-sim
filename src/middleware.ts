export { proxy as default } from "@/lib/proxy";

export const config = {
  matcher: ["/admin/:path*", "/onboarding"],
  runtime: "nodejs" as const,
};
