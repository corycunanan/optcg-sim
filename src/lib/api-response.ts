import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Standardized API response helpers.
 *
 * Success:  { data: T }                              — single resource
 * List:     { data: T[], pagination?: {...} }         — resource list
 * Action:   { success: true }                         — delete/action confirmation
 * Error:    { error: string }                         — all error responses
 */

/**
 * Auth guard for API routes. Returns session + userId or a 401 response.
 * Usage:
 *   const authResult = await requireAuth();
 *   if (authResult instanceof Response) return authResult;
 *   const { session, userId } = authResult;
 */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    return apiError("Unauthorized", 401);
  }
  return { session, userId: session.user.id };
}

/**
 * Admin guard for API routes. Returns session + userId on success, or a 401
 * for unauthenticated callers and 403 for authenticated non-admins.
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    return apiError("Unauthorized", 401);
  }
  if (!session.user.isAdmin) {
    return apiError("Forbidden", 403);
  }
  return { session, userId: session.user.id };
}

export function apiSuccess<T>(data: T, status = 200, headers?: HeadersInit) {
  return NextResponse.json({ data }, { status, headers });
}

export function apiList<T>(data: T[], pagination?: {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}, headers?: HeadersInit) {
  return NextResponse.json(pagination ? { data, pagination } : { data }, { headers });
}

export function apiAction() {
  return NextResponse.json({ success: true });
}

export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
