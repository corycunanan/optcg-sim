import { NextResponse } from "next/server";
import type { z } from "zod";

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns the validated data or a 400 NextResponse with the first error message.
 */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T | NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = formatZodError(result.error);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return result.data;
}

/**
 * Type guard: returns true if parseBody returned an error response.
 */
export function isErrorResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

function formatZodError(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return "Validation failed";
  const path = first.path.length > 0 ? `${first.path.join(".")}: ` : "";
  return `${path}${first.message}`;
}
