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
  | "don"
  | "counter"
  | "trigger";

export type EffectSegment =
  /**
   * Run of effect text carried through unchanged, including any unrecognized
   * bracket token and any interior run of spaces. Only whitespace at a line's
   * two edges is dropped — see `parseEffectText`.
   */
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

  // When the effect happens, including whose turn permits it.
  "on play": "timing",
  "activate: main": "timing",
  main: "timing",
  "when attacking": "timing",
  "on k.o.": "timing",
  "on block": "timing",
  "on your opponent's attack": "timing",
  "end of your turn": "timing",
  "your turn": "timing",
  "opponent's turn": "timing",

  // Evergreen abilities the effect grants or the card has.
  blocker: "keyword",
  rush: "keyword",
  "rush: character": "keyword",
  "double attack": "keyword",
  banish: "keyword",
  unblockable: "keyword",

  // How often an effect can be used within its timing window.
  "once per turn": "modifier",

  // Attached-DON!! conditions keep the printed badge's own dark treatment, so
  // they are their own family rather than sharing the constraint chip.
  "don!! x1": "don",
  "don!! x2": "don",
  "don!! x3": "don",
} as const satisfies Record<string, EffectNotationFamily>;

/**
 * Forward tolerance for DON!! costs beyond those printed today: `[DON!! x4]`
 * should badge as a DON!! condition the day a set prints it, not render as a
 * bracket.
 */
const DON_CONDITION = /^don!! x\d+$/;

/** Delimiter pairs the notation uses, opener → closer. */
const DELIMITERS: Record<string, string> = { "[": "]", "{": "}" };

/**
 * A delimiter inside a candidate token means the delimiters are nested or
 * interleaved. No printed token contains one, so the span is malformed.
 */
const NESTED_DELIMITER = /[[\]{}]/;

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
  return DON_CONDITION.test(normalized) ? "don" : null;
}

/**
 * Resolves one well-formed delimiter pair, or `null` when its contents are not
 * something this renderer recognizes (a referenced card name, an empty pair).
 */
function toSegment(opener: string, inner: string): EffectSegment | null {
  if (opener === "{") {
    const label = inner.trim();
    // A brace pair with nothing but whitespace inside is not a trait; leaving
    // it as text keeps it exactly as printed rather than showing an empty chip.
    return label.length > 0 ? { kind: "trait", label } : null;
  }

  const family = classifyNotationToken(inner);
  return family ? { kind: "notation", family, label: inner.trim() } : null;
}

/**
 * Splits one printed effect into notation, trait, and verbatim text runs.
 *
 * Malformed delimiters degrade to plain text as a whole span, never as a
 * partially interpreted fragment: `[Sabo [Rush]` prints exactly as written
 * rather than dropping `[Sabo ` next to a Rush badge, and an opener that
 * nothing closes is just punctuation, so a well-formed token later on the same
 * line still renders.
 */
export function parseEffectLine(line: string): EffectParagraph {
  const segments: EffectSegment[] = [];
  let pending = "";
  let index = 0;

  const flush = (): void => {
    if (pending.length === 0) return;
    segments.push({ kind: "text", text: pending });
    pending = "";
  };

  while (index < line.length) {
    const opener = line[index];
    const closer = DELIMITERS[opener];

    if (closer === undefined) {
      pending += opener;
      index += 1;
      continue;
    }

    const end = line.indexOf(closer, index + 1);
    if (end === -1) {
      pending += opener;
      index += 1;
      continue;
    }

    const inner = line.slice(index + 1, end);
    const segment = NESTED_DELIMITER.test(inner)
      ? null
      : toSegment(opener, inner);

    if (segment) {
      flush();
      segments.push(segment);
    } else {
      pending += line.slice(index, end + 1);
    }

    index = end + 1;
  }

  flush();
  return segments;
}

/**
 * Parses a card's effect text into one paragraph per printed effect.
 *
 * The pipeline stores each effect on its own line (`shared/effect-text.ts`
 * turns the source `<br>` into `\n`), so a line break in the data is an effect
 * boundary, not a soft wrap. Blank lines carry no content and are dropped.
 *
 * Whitespace contract: each line is trimmed at its two edges, because edge
 * whitespace in this data is a formatting artifact of the `<br>` conversion and
 * would otherwise indent a paragraph or hang a space past its last word.
 * Whitespace *inside* a line is carried through byte for byte, which is what
 * the renderer's `whitespace-pre-wrap` preserves.
 */
export function parseEffectText(effectText: string): EffectParagraph[] {
  if (typeof effectText !== "string") return [];

  return effectText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseEffectLine);
}
