/**
 * POST /api/auth/register — Create a credentials account
 */

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { RegisterSchema } from "@/lib/validators/auth";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { authLimiter } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const { limited } = await authLimiter.check(`register:${ip}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  try {
    const parsed = await parseBody(request, RegisterSchema);
    if (isErrorResponse(parsed)) return parsed;
    const { email, username, password } = parsed;

    // Uniqueness checks
    const [existingEmail, existingUsername] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.user.findUnique({ where: { username } }),
    ]);

    if (existingEmail) {
      return apiError("An account with this email already exists", 409);
    }
    if (existingUsername) {
      return apiError("This username is already taken", 409);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        name: username,
        password: hashedPassword,
      },
      select: { id: true, email: true, username: true },
    });

    return apiSuccess(user, 201);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = error.meta?.target as string[] | undefined;
      if (target?.includes("email")) {
        return apiError("An account with this email already exists", 409);
      }
      if (target?.includes("username")) {
        return apiError("This username is already taken", 409);
      }
      return apiError("An account with these details already exists", 409);
    }
    console.error("Register error:", error);
    return apiError("Registration failed", 500);
  }
}
