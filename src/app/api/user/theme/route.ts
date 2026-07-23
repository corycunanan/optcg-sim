/**
 * GET /api/user/theme — Mirror the authoritative DB theme into this device's
 * cookie. A settings surface can call this after authentication on a new
 * device.
 *
 * PUT /api/user/theme — Persist a registered theme, then mirror it to the
 * cookie used by the next SSR request.
 */

import { NextRequest, type NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import {
  THEME_COOKIE_NAME,
  THEME_COOKIE_OPTIONS,
  resolveThemeName,
  type ThemeName,
} from "@/lib/theme";
import { SetThemeSchema } from "@/lib/validators/user";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";

function mirrorThemeCookie(response: NextResponse, theme: ThemeName) {
  response.cookies.set(THEME_COOKIE_NAME, theme, THEME_COOKIE_OPTIONS);
  return response;
}

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;

  try {
    const user = await prisma.user.findUnique({
      where: { id: authResult.userId },
      select: { theme: true },
    });
    if (!user) return apiError("User not found", 404);

    const theme = resolveThemeName(user.theme);
    return mirrorThemeCookie(apiSuccess({ theme }), theme);
  } catch (error) {
    console.error("[user:get-theme] failed", error);
    return apiError("Failed to load theme", 500);
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;

  try {
    const parsed = await parseBody(request, SetThemeSchema);
    if (isErrorResponse(parsed)) return parsed;

    const user = await prisma.user.update({
      where: { id: authResult.userId },
      data: { theme: parsed.theme },
      select: { theme: true },
    });
    const theme = resolveThemeName(user.theme);

    return mirrorThemeCookie(apiSuccess({ theme }), theme);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return apiError("User not found", 404);
    }
    console.error("[user:set-theme] failed", error);
    return apiError("Failed to set theme", 500);
  }
}
