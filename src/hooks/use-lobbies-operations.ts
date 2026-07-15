"use client";

import { ApiError, apiPost } from "@/lib/api-client";
import {
  CreateLobbyResponseSchema,
  JoinLobbyResponseSchema,
} from "@/lib/validators/lobbies";
import { useAsyncOperation } from "./use-async-operation";

interface LobbiesOperationCallbacks {
  onCreated: (lobbyId: string) => void;
  onJoined: (lobbyId: string) => void;
  onConceded: () => void;
}

export function useLobbiesOperations({
  onCreated,
  onJoined,
  onConceded,
}: LobbiesOperationCallbacks) {
  const createOperation = useAsyncOperation(() =>
    apiPost("/api/lobbies", { format: "Standard" }, CreateLobbyResponseSchema)
  );
  const joinOperation = useAsyncOperation((code: string) =>
    apiPost("/api/lobbies/join", { code }, JoinLobbyResponseSchema)
  );
  const concedeOperation = useAsyncOperation((gameId: string) =>
    apiPost(`/api/game/${gameId}`, { action: "CONCEDE" })
  );

  const createLobby = async () => {
    try {
      const { data, isCurrent } = await createOperation.execute();
      if (isCurrent) onCreated(data.data.lobbyId);
    } catch {
      // The operation exposes the error for the existing inline message.
    }
  };

  const joinLobby = async (code: string) => {
    try {
      const { data, isCurrent } = await joinOperation.execute(code);
      if (isCurrent) onJoined(data.data.lobbyId);
    } catch {
      // The operation exposes the error for the existing inline message.
    }
  };

  const concedeGame = async (gameId: string) => {
    try {
      const { isCurrent } = await concedeOperation.execute(gameId);
      if (isCurrent) onConceded();
    } catch {
      // The operation exposes the error for the existing inline message.
    }
  };

  return {
    creating: createOperation.status === "pending",
    createError: operationErrorMessage(
      createOperation.error,
      "Could not create lobby"
    ),
    createLobby,
    joining: joinOperation.status === "pending",
    joinError: operationErrorMessage(
      joinOperation.error,
      "Could not join lobby"
    ),
    joinLobby,
    conceding: concedeOperation.status === "pending",
    concedeError: operationErrorMessage(
      concedeOperation.error,
      "Network error"
    ),
    concedeGame,
  };
}

function operationErrorMessage(
  error: unknown | null,
  fallback: string
): string | null {
  if (error === null) return null;
  return error instanceof ApiError ? error.message : fallback;
}
