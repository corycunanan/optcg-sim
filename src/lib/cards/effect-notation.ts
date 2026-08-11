/**
 * Effect-text notation parser.
 *
 * Printed OPTCG cards write their rules text in a small closed notation:
 * bracketed tokens for *when* an effect happens (`[On Play]`), what evergreen
 * ability it grants (`[Rush]`), what constrains it (`[Once Per Turn]`,
 * `[DON!! x1]`), and the two play-timing markers that get their own printed
 * treatment (`[Trigger]`, `[Counter]`). Braces mark a card *type* — a trait —
 * as in `{Sky Island}`.
 *
 * This module turns one card's effect text into paragraphs of segments so a
 * renderer can give each family the treatment it has on the printed card,
 * without the renderer needing to know anything about the notation.
 *
 * Two deliberate decisions:
 *
 * 1. **Brackets are not automatically notation.** Cards also reference other
 *    cards by name in brackets — `[Monkey.D.Luffy]`, `[Sanji]`, `[Enel]` — and
 *    those are printed as ordinary text. Any bracketed token outside the closed
 *    vocabulary below is emitted verbatim, brackets included, exactly as it is
 *    printed. Badging every bracket would put a chip around a third of the
 *    proper nouns in the game.
 *
 * 2. **The vocabulary is derived from the committed card corpus**
 *    (`docs/cards/*.md`), not from the engine's trigger-matching tables in
 *    `src/lib/game/effect-clauses.ts`. Those tables exist to match authored
 *    effect blocks and carry entries the printed corpus does not use (and vice
 *    versa); keying the reader's vocabulary off them would inherit their blind
 *    spots. `effect-notation.test.ts` asserts this vocabulary and the corpus
 *    agree in both directions, so a new set that prints a new token fails CI
 *    instead of silently rendering a raw bracket.
 */

/** Printed-card notation families. Each gets a distinct badge treatment. */
export type EffectNotationFamily =
  | "timing"
  | "keyword"
  | "modifier"
  | "counter"
  | "trigger";

export type EffectSegment =
  /** Verbatim run of effect text, including any unrecognized bracket token. */
  | { kind: "text"; text: string }
  /** A recognized bracket token, brackets stripped. */
  | { kind: "notation"; family: EffectNotationFamily; label: string }
  /** A `{Trait}` card type, braces stripped. */
  | { kind: "trait"; label: string };

/** One printed effect — the segments of a single source line. */
export type EffectParagraph = EffectSegment[];

/**
 * Every notation token printed in `docs/cards/`, normalized, with the family it
 * belongs to. Kept exact rather than pattern-matched so an unfamiliar token
 * falls through to plain text instead of being mis-badged.
 */
export const PRINTED_NOTATION_TOKENS = {
  // Play-timing markers that own a distinct printed treatment.
  trigger: "trigger",
  counter: "counter",

  // When the effect happens.
  "on play": "timing",
  "activate: main": "timing",
  main: "timing",
  "when attacking": "timing",
  "on k.o.": "timing",
  "on block": "timing",
  "on your opponent's attack": "timing",
  "end of your turn": "timing",

  // Evergreen abilities the effect grants or the card has.
  blocker: "keyword",
  rush: "keyword",
  "rush: character": "keyword",
  "double attack": "keyword",
  banish: "keyword",
  unblockable: "keyword",

  // Constraints on an effect that is already timed by one of the above.
  "once per turn": "modifier",
  "your turn": "modifier",
  "opponent's turn": "modifier",
  "don!! x1": "modifier",
  "don!! x2": "modifier",
  "don!! x3": "modifier",
} as const satisfies Record<string, EffectNotationFamily>;

/**
 * Forward tolerance for DON!! costs beyond those printed today: `[DON!! x4]`
 * should badge as a modifier the day a set prints it, not render as a bracket.
 */
const DON_MODIFIER = /^don!! x\d+$/;

/** Bracket token or brace trait, whichever comes first. */
const NOTATION_PATTERN = /\[([^[\]]+)\]|\{([^{}]+)\}/g;

function normalizeToken(token: string): string {
  return token.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Resolves a bracket token's inner text to its notation family, or `null` when
 * the token is not notation at all (most often a referenced card name).
 */
export function classifyNotationToken(
  token: string
): EffectNotationFamily | null {
  const normalized = normalizeToken(token);
  const printed: EffectNotationFamily | undefined = (
    PRINTED_NOTATION_TOKENS as Record<string, EffectNotationFamily>
  )[normalized];

  if (printed) return printed;
  return DON_MODIFIER.test(normalized) ? "modifier" : null;
}

/** Splits one printed effect into notation, trait, and verbatim text runs. */
export function parseEffectLine(line: string): EffectParagraph {
  const segments: EffectSegment[] = [];
  let cursor = 0;

  const pushText = (text: string): void => {
    if (text.length === 0) return;
    const previous = segments.at(-1);
    if (previous?.kind === "text") previous.text += text;
    else segments.push({ kind: "text", text });
  };

  for (const match of line.matchAll(NOTATION_PATTERN)) {
    const [raw, bracket, brace] = match;
    pushText(line.slice(cursor, match.index));
    cursor = match.index + raw.length;

    if (brace !== undefined) {
      const label = brace.trim();
      // A brace pair with nothing but whitespace inside is not a trait; leave
      // it exactly as printed rather than rendering an empty chip.
      if (label.length > 0) segments.push({ kind: "trait", label });
      else pushText(raw);
      continue;
    }

    const family = classifyNotationToken(bracket);
    if (family) segments.push({ kind: "notation", family, label: bracket.trim() });
    else pushText(raw);
  }

  pushText(line.slice(cursor));
  return segments;
}

/**
 * Parses a card's effect text into one paragraph per printed effect.
 *
 * The pipeline stores each effect on its own line (`shared/effect-text.ts`
 * turns the source `<br>` into `\n`), so a line break in the data is an effect
 * boundary, not a soft wrap. Blank lines carry no content and are dropped.
 */
export function parseEffectText(effectText: string): EffectParagraph[] {
  if (typeof effectText !== "string") return [];

  return effectText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseEffectLine);
}
