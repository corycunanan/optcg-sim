import { handlers } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

async function wrappedGET(req: NextRequest) {
  try {
    return await handlers.GET(req);
  } catch (e: unknown) {
    console.error("[AUTH ERROR]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined },
      { status: 500 }
    );
  }
}

async function wrappedPOST(req: NextRequest) {
  try {
    return await handlers.POST(req);
  } catch (e: unknown) {
    console.error("[AUTH ERROR]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined },
      { status: 500 }
    );
  }
}

export { wrappedGET as GET, wrappedPOST as POST };
