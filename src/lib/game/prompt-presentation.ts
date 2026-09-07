import type { CardDb, PromptSourceCard } from "@shared/game-types";
import { parseEffectText } from "@/lib/cards/effect-notation";

/**
 * The effect timing a prompt belongs to, read from the leading notation of its
 * effect description: `[On Play]`, `[Activate: Main]`, `[Trigger]`, `[Counter]`.
 * A `[DON!! x1]` or `[Once Per Turn]` prefix is skipped. Returns `null` when the
 * description opens with prose instead of a timing token (cost prompts, choice
 * questions), so the caller can fall back to a plain title.
 */
export function promptEffectType(effectDescription: string): string | null {
  const [firstParagraph] = parseEffectText(effectDescription);
  if (!firstParagraph) return null;
  for (const segment of firstParagraph) {
    if (segment.kind === "notation") {
      if (
        segment.family === "timing" ||
        segment.family === "trigger" ||
        segment.family === "counter"
      ) {
        return segment.label;
      }
      continue;
    }
    if (segment.kind === "text" && segment.text.trim() === "") continue;
    return null;
  }
  return null;
}

/** Modal title: `Card Effect: <timing>`, or `Card Effect` without a timing. */
export function promptDialogTitle(effectDescription: string): string {
  const effectType = promptEffectType(effectDescription);
  return effectType ? `Card Effect: ${effectType}` : "Card Effect";
}

/** Printed name of the prompt's source card, or `null` when there is none. */
export function promptSourceCardName(
  cardDb: CardDb,
  sourceCard: Pick<PromptSourceCard, "cardId"> | undefined
): string | null {
  if (!sourceCard) return null;
  return cardDb[sourceCard.cardId]?.name ?? sourceCard.cardId;
}
