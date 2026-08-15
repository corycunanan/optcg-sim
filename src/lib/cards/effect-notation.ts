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
 * A card also prices some of its effects: `You may trash 1 card from your hand:
 * Draw 1 card.` reads *pay this, then get that*, and the colon is the boundary.
 * This module marks that price as its own segment kind so the renderer can set
 * it apart — see the cost grammar above `findCostSpan`.
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
  | { kind: "trait"; label: string }
  /**
   * The price of an effect — the phrase the reader pays before the colon.
   * Carries its own segments because a cost is written in the same notation as
   * the rest of the line (`You may trash 1 {Navy} type card from your hand:`,
   * `You may trash 1 card with a [Trigger] from your hand:`), and those chips
   * have to survive inside it. Never nests: a cost contains no cost.
   */
  | { kind: "cost"; segments: EffectSegment[] };

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
 * Splits `line[from, to)` into notation, trait, and verbatim text runs.
 *
 * Malformed delimiters degrade to plain text as a whole span, never as a
 * partially interpreted fragment: `[Sabo [Rush]` prints exactly as written
 * rather than dropping `[Sabo ` next to a Rush badge, and an opener that
 * nothing closes is just punctuation, so a well-formed token later on the same
 * line still renders.
 */
function parseRuns(line: string, from: number, to: number): EffectSegment[] {
  const segments: EffectSegment[] = [];
  let pending = "";
  let index = from;

  const flush = (): void => {
    if (pending.length === 0) return;
    segments.push({ kind: "text", text: pending });
    pending = "";
  };

  while (index < to) {
    const opener = line[index];
    const closer = DELIMITERS[opener];

    if (closer === undefined) {
      pending += opener;
      index += 1;
      continue;
    }

    const end = line.indexOf(closer, index + 1);
    if (end === -1 || end >= to) {
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
 * Every span a colon can hide inside. Parentheses join the notation's own two
 * pairs here because a cost ends at a colon that belongs to *no* span, and the
 * corpus prints colons inside all three: `[Activate: Main]` is a heading, and
 * reminder text can carry one too.
 */
const SPAN_OPENERS = "[{(";
const SPAN_CLOSERS = "]})";

/** The colon that separates a cost from what it buys, or `-1` if there is none. */
function findTopLevelColon(line: string, from: number): number {
  let depth = 0;

  for (let index = from; index < line.length; index += 1) {
    const character = line[index];

    if (SPAN_OPENERS.includes(character)) depth += 1;
    else if (SPAN_CLOSERS.includes(character)) depth = Math.max(0, depth - 1);
    else if (character === ":" && depth === 0) return index;
  }

  return -1;
}

/**
 * The families a bracket token belongs to when it is heading an effect rather
 * than being referred to by one. `[Trigger]`, `[Counter]`, and the keywords are
 * absent on purpose: a card can talk *about* them mid-sentence — `You may trash
 * 1 card with a [Trigger] from your hand:` is a cost, and the token inside it is
 * the thing being paid, not a new effect starting.
 */
const EFFECT_HEADER_FAMILIES: ReadonlySet<EffectNotationFamily> = new Set([
  "timing",
  "modifier",
  "don",
]);

/**
 * Where a cost could begin: past the effect's own heading. Cards stack headings
 * (`[Activate: Main] [Once Per Turn] [DON!! x2]`) and print alternatives with a
 * slash (`[On Play]/[When Attacking]`), so both separators are skipped. A
 * bracket the notation does not recognize is a referenced card name and is
 * content, so scanning stops there.
 */
function skipEffectHeadings(line: string): number {
  let index = 0;

  for (;;) {
    let start = index;
    while (line[start] === " " || line[start] === "/") start += 1;
    if (line[start] !== "[") return start;

    const end = line.indexOf("]", start + 1);
    if (end === -1) return start;
    if (classifyNotationToken(line.slice(start + 1, end)) === null) return start;

    index = end + 1;
  }
}

/**
 * A condition is not a price. `If your Leader is [Shirahoshi], you may turn 1
 * card from the top of your Life cards face-down: Draw 1 card.` costs the Life
 * card; the Leader clause is the gate on being allowed to pay at all, so the
 * cost starts after it.
 */
const CONDITION_PREFIX = /^If\b[^:]*?,\s+(?=[Yy]ou\s+(?:may|can)\s)/;

/**
 * The three ways the corpus opens a price.
 *
 * `DON!! −N` returns DON!! cards to the DON!! deck; the circled numerals are the
 * printed symbol for resting that many DON!! in the cost area; `You may`/`You
 * can` opens an optional payment, which is how nearly every non-DON!! cost is
 * written. A phrase that opens no other way is not treated as a cost — see the
 * precision note on `findCostSpan`.
 */
const COST_OPENERS = [
  /^DON!!\s*[−-]\s*\d+/,
  /^[①-⑳➀-➓]/,
  /^[Yy]ou\s+(?:may|can)\s/,
] as const;

/** True when the phrase contains a bracket token that heads an effect. */
function containsEffectHeading(phrase: string): boolean {
  for (const [, token] of phrase.matchAll(/\[([^[\]]*)\]/g)) {
    const family = classifyNotationToken(token);
    if (family !== null && EFFECT_HEADER_FAMILIES.has(family)) return true;
  }

  return false;
}

/**
 * True when the phrase runs past the end of a sentence or clause. A price is one
 * clause; a semicolon or a full stop means the colon further along belongs to
 * something else, which is what keeps a paragraph whose effects ran together in
 * the source from being emphasized end to end.
 *
 * The full stop has to be a real one: `K.O.` and `Monkey.D.Luffy` abbreviate
 * with periods, so a period after a capital is not the end of anything. What
 * does end a sentence is a period after a lowercase letter, a digit, a closing
 * quote, or a closing delimiter — nothing abbreviates through `]` or `}`, so
 * `You may play [Monkey.D.Luffy]. Then, choose one:` is two sentences and prices
 * neither. Periods inside reminder text are skipped with the parentheses that
 * wrap it.
 */
function runsPastOneClause(phrase: string): boolean {
  let depth = 0;

  for (let index = 0; index < phrase.length; index += 1) {
    const character = phrase[index];

    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (depth > 0) continue;
    else if (character === ";") return true;
    else if (character === ".") {
      const before = phrase[index - 1] ?? "";
      const after = phrase.slice(index + 1);
      if (/[a-z0-9)\]}"']/.test(before) && (after === "" || /^[\s[]/.test(after)))
        return true;
    }
  }

  return false;
}

/**
 * The half-open range of `line` that prices the effect, or `null` when the line
 * prices nothing.
 *
 * The grammar is deliberately narrow, because the two kinds of mistake are not
 * equally bad: a cost that goes unemphasized is a missed polish beat, while an
 * emphasized run of ordinary prose is a misreading of the card. So a phrase is a
 * cost only when it sits at the effect's cost position — past the headings and
 * past any `If …,` gate — *and* opens with one of the three printed payment
 * markers, *and* stays inside one clause that starts no new effect.
 *
 * What that deliberately leaves alone, measured over `docs/cards/`: the option
 * headers (`Choose one:`, `Your opponent chooses one:`, `Apply each of the
 * following effects…:`), which are prose introducing a list rather than a price.
 * It also gives up on the two printed costs written as a bare imperative
 * (`Rest 1 of your DON!! cards and you may rest this Character:`), because a
 * bare imperative is indistinguishable from the sentence of an effect body
 * except by knowing which verbs happen to name payments — and a verb list like
 * that is exactly the kind of arbitrary rule that would go wrong on a set this
 * corpus does not contain yet.
 */
function findCostSpan(line: string): { start: number; end: number } | null {
  let start = skipEffectHeadings(line);
  const colon = findTopLevelColon(line, start);
  if (colon === -1 || colon <= start) return null;

  const gate = line.slice(start, colon).match(CONDITION_PREFIX);
  if (gate) start += gate[0].length;

  const phrase = line.slice(start, colon).trimEnd();
  if (phrase.length === 0) return null;
  if (!COST_OPENERS.some((opener) => opener.test(phrase))) return null;
  if (containsEffectHeading(phrase)) return null;
  if (runsPastOneClause(phrase)) return null;

  return { start, end: colon };
}

/**
 * Emits the cost range, holding back the reminder text a cost carries.
 *
 * `DON!! −1 (You may return the specified number of DON!! cards from your field
 * to your DON!! deck.):` is a two-word price followed by fifteen words of
 * boilerplate that repeats on every card printing that cost. Emphasizing the
 * whole run would put the reader's eye on the boilerplate and spend the emphasis
 * on nothing, so the parenthesized reminder keeps the paragraph's own weight and
 * the price around it is what stands out. Edge whitespace is pushed out of the
 * emphasized run for the same reason: there is nothing to emphasize in a space.
 *
 * The colon is left outside the range as well. It is the joint between the price
 * and what the price buys, and belongs to neither.
 */
function parseCostSpan(line: string, from: number, to: number): EffectSegment[] {
  const segments: EffectSegment[] = [];

  const emit = (start: number, end: number, emphasized: boolean): void => {
    if (end <= start) return;

    if (!emphasized) {
      segments.push(...parseRuns(line, start, end));
      return;
    }

    let inner = start;
    let outer = end;
    while (inner < outer && /\s/.test(line[inner])) inner += 1;
    while (outer > inner && /\s/.test(line[outer - 1])) outer -= 1;

    segments.push(...parseRuns(line, start, inner));
    const priced = parseRuns(line, inner, outer);
    if (priced.length > 0) segments.push({ kind: "cost", segments: priced });
    segments.push(...parseRuns(line, outer, end));
  };

  let depth = 0;
  let runStart = from;

  for (let index = from; index < to; index += 1) {
    const character = line[index];

    if (character === "(") {
      if (depth === 0) {
        emit(runStart, index, true);
        runStart = index;
      }
      depth += 1;
    } else if (character === ")") {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        emit(runStart, index + 1, false);
        runStart = index + 1;
      }
    }
  }

  emit(runStart, to, depth === 0);
  return segments;
}

/**
 * Splits one printed effect into cost, notation, trait, and verbatim text runs.
 */
export function parseEffectLine(line: string): EffectParagraph {
  const cost = findCostSpan(line);
  if (cost === null) return parseRuns(line, 0, line.length);

  return [
    ...parseRuns(line, 0, cost.start),
    ...parseCostSpan(line, cost.start, cost.end),
    ...parseRuns(line, cost.end, line.length),
  ];
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
