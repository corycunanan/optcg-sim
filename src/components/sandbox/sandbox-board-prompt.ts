import type { BoardState } from "@/components/game/board";
import type { SandboxGameSessionGame } from "./sandbox-session-provider";

export function sandboxBoardPrompt(
  game: Pick<SandboxGameSessionGame, "activePrompt" | "activePromptId">,
): Pick<BoardState, "activePrompt" | "activePromptId"> {
  return {
    activePrompt: game.activePrompt,
    activePromptId: game.activePromptId,
  };
}
