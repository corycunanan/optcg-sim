import { NextResponse } from "next/server";

export async function GET() {
  const results: Record<string, unknown> = {};

  // Test 1: Can we reach Google's OIDC discovery endpoint?
  try {
    const res = await fetch("https://accounts.google.com/.well-known/openid-configuration");
    results.googleOIDC = { status: res.status, ok: res.ok };
  } catch (e: unknown) {
    results.googleOIDC = { error: e instanceof Error ? e.message : String(e) };
  }

  // Test 2: Try to initiate the auth flow manually  
  try {
    const { handlers } = await import("@/auth");
    
    // Create a fake request to /api/auth/signin/google
    const req = new Request("https://optcg-sim.vercel.app/api/auth/signin/google", {
      method: "GET",
      headers: {
        host: "optcg-sim.vercel.app",
      },
    });
    
    const response = await handlers.GET(req);
    results.authSignin = { 
      status: response.status, 
      location: response.headers.get("location")?.substring(0, 100),
      headers: Object.fromEntries(response.headers.entries()),
    };
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    results.authSignin = { 
      error: err.message, 
      name: (e as {name?: string}).name,
      stack: err.stack?.split("\n").slice(0, 5).join(" | "),
    };
  }

  return NextResponse.json(results, { status: 200 });
}
