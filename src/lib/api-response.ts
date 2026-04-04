import { NextResponse } from "next/server";

/**
 * Standardized API response helpers.
 *
 * Success:  { data: T }                              — single resource
 * List:     { data: T[], pagination?: {...} }         — resource list
 * Action:   { success: true }                         — delete/action confirmation
 * Error:    { error: string }                         — all error responses
 */

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function apiList<T>(data: T[], pagination?: {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}) {
  return NextResponse.json(pagination ? { data, pagination } : { data });
}

export function apiAction() {
  return NextResponse.json({ success: true });
}

export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
