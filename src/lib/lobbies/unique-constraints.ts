import { Prisma } from "@prisma/client";

export function isJoinCodeCollision(error: unknown) {
  return hasUniqueTarget(error, "join_code", "joinCode");
}

export function isLobbyGuestCollision(error: unknown) {
  return hasUniqueTarget(error, "lobbyId", "lobby_guests_lobbyId_key");
}

export function isLobbySpectatorCollision(error: unknown) {
  const targetValues = uniqueTargetValues(error);
  if (!targetValues) return false;

  if (targetValues.includes("lobby_spectators_lobby_id_user_id_key")) {
    return true;
  }

  return (
    (targetValues.includes("lobbyId") && targetValues.includes("userId")) ||
    (targetValues.includes("lobby_id") && targetValues.includes("user_id"))
  );
}

function hasUniqueTarget(error: unknown, ...targets: string[]) {
  const targetValues = uniqueTargetValues(error);
  return targetValues?.some((value) => targets.includes(value)) ?? false;
}

function uniqueTargetValues(error: unknown) {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return null;
  }

  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.filter((value): value is string => typeof value === "string")
    : typeof target === "string"
      ? [target]
      : [];
}
