import { Prisma } from "@prisma/client";

export function isJoinCodeCollision(error: unknown) {
  return hasUniqueTarget(error, "join_code", "joinCode");
}

export function isActiveLobbyConflict(error: unknown) {
  return hasUniqueTarget(error, "hostUserId", "lobbies_waiting_host_unique");
}

function hasUniqueTarget(error: unknown, ...targets: string[]) {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;
  const targetValues = Array.isArray(target)
    ? target.filter((value): value is string => typeof value === "string")
    : typeof target === "string"
      ? [target]
      : [];

  return targetValues.some((value) => targets.includes(value));
}
