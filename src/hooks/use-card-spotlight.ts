"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { GameEvent } from "@shared/game-types";
import type { AcceptedGameUpdate } from "@/hooks/use-game-ws";
import {
  findLatestSpotlight,
  shouldBlockBoardForSpotlight,
  type SpotlightPresentation,
} from "@/lib/game/spotlight";

const SPOTLIGHT_DWELL_MS = 1000;

interface ActiveSpotlight {
  presentation: SpotlightPresentation;
  sourceUpdateSequence: number;
}

export interface UseCardSpotlightInput {
  eventLog: GameEvent[];
  acceptedUpdate?: AcceptedGameUpdate | null;
  myIndex: 0 | 1 | null;
  promptRespondingPlayer?: 0 | 1 | null;
}

export function useCardSpotlight({
  eventLog,
  acceptedUpdate = null,
  myIndex,
  promptRespondingPlayer = null,
}: UseCardSpotlightInput) {
  const initializedRef = useRef(false);
  const lastTimestampRef = useRef<number | null>(null);
  const [active, setActive] = useState<ActiveSpotlight | null>(null);
  const [view, setView] = useState<"spotlight" | "board">("spotlight");

  useLayoutEffect(() => {
    const latestTimestamp = eventLog.at(-1)?.timestamp ?? null;
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastTimestampRef.current = latestTimestamp;
      return;
    }

    if (eventLog.length === 0) {
      lastTimestampRef.current = null;
      return;
    }

    const previousTimestamp = lastTimestampRef.current;
    const newEvents =
      previousTimestamp === null
        ? eventLog
        : eventLog.filter((event) => event.timestamp > previousTimestamp);
    lastTimestampRef.current = latestTimestamp;
    const nextPresentation = findLatestSpotlight(newEvents);
    const updateSequence = acceptedUpdate?.sequence ?? 0;

    // The event log is the websocket's external event stream. Mirroring a
    // new server event into transient presentation state is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive((current) => {
      if (nextPresentation) {
        return {
          presentation: nextPresentation,
          sourceUpdateSequence: updateSequence,
        };
      }
      if (current && updateSequence > current.sourceUpdateSequence) {
        return null;
      }
      return current;
    });
    if (nextPresentation) {
      setView("spotlight");
    }
  }, [acceptedUpdate?.sequence, eventLog]);

  const isWaitingForOtherPlayer = Boolean(
    promptRespondingPlayer !== null &&
    promptRespondingPlayer !== myIndex
  );
  const isWaiting = Boolean(active && isWaitingForOtherPlayer);

  const dismiss = useCallback(() => setActive(null), []);
  const toggleView = useCallback(() => {
    setView((current) => (current === "spotlight" ? "board" : "spotlight"));
  }, []);

  useEffect(() => {
    if (!active || isWaiting) return;
    const timer = window.setTimeout(dismiss, SPOTLIGHT_DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [active, dismiss, isWaiting]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismiss();
        return;
      }
      if (isWaiting && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleView();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, dismiss, isWaiting, toggleView]);

  return {
    presentation: active?.presentation ?? null,
    view,
    isWaiting,
    dismiss,
    toggleView,
    isBlockingPrompt: shouldBlockBoardForSpotlight(
      active !== null,
      promptRespondingPlayer,
      myIndex
    ),
  };
}
