/**
 * Server-to-server lifecycle probe for one game's Durable Object. Shared by
 * the daily finalization-repair cron and the lobby room's on-read repair.
 */

import { gameWorkerFetch } from "@/lib/game-worker/client";

const WORKER_STATUS_TIMEOUT_MS = 1_500;

export type WorkerProbe =
  | { kind: "LIVE" }
  | { kind: "ABSENT" }
  | {
      kind: "TERMINAL";
      status: "FINISHED" | "ABANDONED";
      winnerId: string | null;
      winReason: string | null;
    }
  | { kind: "UNREACHABLE"; reason: string };

export async function probeWorkerStatus(
  gameId: string,
  timeoutMs = WORKER_STATUS_TIMEOUT_MS
): Promise<WorkerProbe> {
  let response: Response;
  try {
    response = await gameWorkerFetch(`/game/${gameId}/status`, {
      method: "GET",
      timeoutMs,
    });
  } catch (error) {
    return {
      kind: "UNREACHABLE",
      reason: error instanceof Error ? error.name : "transport_error",
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: "UNREACHABLE", reason: "invalid_response" };
  }

  if (!isRecord(body) || typeof body.status !== "string") {
    return { kind: "UNREACHABLE", reason: "invalid_response" };
  }
  if (response.status === 404 && body.status === "ABSENT") {
    return { kind: "ABSENT" };
  }
  if (!response.ok) {
    return { kind: "UNREACHABLE", reason: `http_${response.status}` };
  }
  if (body.status === "IN_PROGRESS") {
    return { kind: "LIVE" };
  }
  if (body.status !== "FINISHED" && body.status !== "ABANDONED") {
    return { kind: "UNREACHABLE", reason: "invalid_response" };
  }

  const winnerId = body.winnerId;
  const winReason = body.winReason;
  if (
    (winnerId !== null && typeof winnerId !== "string") ||
    (winReason !== null && typeof winReason !== "string")
  ) {
    return { kind: "UNREACHABLE", reason: "invalid_response" };
  }

  return {
    kind: "TERMINAL",
    status: body.status,
    winnerId,
    winReason,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
