"use client";

// Playback transport for the Animation Sandbox scenario player (OPT-291).
// Bound to the scenario runner's controls (OPT-289). Pure presentation —
// callers pass `playbackState` and the four runner control callbacks.
//
// In `mode: "playground"` (OPT-307), Play/Pause/Step and the step counter
// are hidden — there's no script to advance — and Reset is the only
// transport surface the user sees. Mute stays in both modes.
//
// Mute state is sourced from `useSandboxMute` (OPT-297) so the toggle
// persists across page reloads and any future audio-emitting component
// can read the same value through context.

import { Pause, Play, RotateCcw, StepForward, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { ScenarioMode } from "@/lib/sandbox/scenarios";
import { useSandboxMute } from "./use-sandbox-mute";
import type { PlaybackState } from "./use-scenario-runner";

export interface PlaybackControlBarProps {
  playbackState: PlaybackState;
  currentStepIndex: number;
  totalSteps: number;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onStep: () => void;
  mode?: ScenarioMode;
}

export function PlaybackControlBar({
  playbackState,
  currentStepIndex,
  totalSteps,
  onPlay,
  onPause,
  onReset,
  onStep,
  mode = "scripted",
}: PlaybackControlBarProps) {
  const { muted, toggle: toggleMute } = useSandboxMute();

  const isPlayground = mode === "playground";
  const isPlaying = playbackState === "playing";
  const isEnded = playbackState === "ended";
  const isAwaitingResponse = playbackState === "awaiting-response";

  // Step is meaningful only when the runner can advance manually — not when
  // a timer is already driving playback, the prompt is open, or we're done.
  const stepDisabled = isPlaying || isEnded || isAwaitingResponse;

  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-border bg-surface-1 px-5 py-3">
      <div className="flex items-center gap-2">
        {!isPlayground &&
          (isPlaying ? (
            <Button
              variant="default"
              size="sm"
              onClick={onPause}
              data-testid="playback-pause"
              aria-label="Pause"
            >
              <Pause className="size-4" aria-hidden />
              <span>Pause</span>
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={onPlay}
              disabled={isEnded}
              data-testid="playback-play"
              aria-label="Play"
            >
              <Play className="size-4" aria-hidden />
              <span>Play</span>
            </Button>
          ))}
        <Button
          variant={isPlayground ? "default" : "outline"}
          size="sm"
          onClick={onReset}
          data-testid="playback-reset"
          aria-label="Reset"
        >
          <RotateCcw className="size-4" aria-hidden />
          <span>Reset</span>
        </Button>
        {!isPlayground && !isEnded && (
          <Button
            variant="outline"
            size="sm"
            onClick={onStep}
            disabled={stepDisabled}
            data-testid="playback-step"
            aria-label="Step"
          >
            <StepForward className="size-4" aria-hidden />
            <span>Step</span>
          </Button>
        )}
      </div>

      {!isPlayground && (
        <div
          className={cn(
            "ml-auto text-xs tabular-nums",
            isEnded ? "text-content-secondary" : "text-content-tertiary",
          )}
          data-testid="playback-step-counter"
        >
          step {currentStepIndex} / {totalSteps}
        </div>
      )}

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={toggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
        aria-pressed={muted}
        data-testid="playback-mute"
        className={cn(isPlayground && "ml-auto")}
      >
        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </Button>
    </div>
  );
}
