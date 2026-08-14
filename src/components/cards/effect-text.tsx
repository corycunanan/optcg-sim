import { cn } from "@/lib/utils";
import {
  parseEffectText,
  type EffectNotationFamily,
  type EffectSegment,
} from "@/lib/cards/effect-notation";

/**
 * Renders a card's printed rules text the way the card prints it: one paragraph
 * per effect, bracketed notation set as inline chips colored by family, and
 * `{Trait}` types set as a quieter inline chip. Everything the notation
 * vocabulary does not recognize — referenced card names such as
 * `[Monkey.D.Luffy]`, reminder text, plain prose — is passed through verbatim.
 *
 * Chip geometry is chosen so a chip never disturbs the paragraph's rhythm: at
 * `leading-4` plus a hairline the chip is 18px tall, which fits inside the
 * 22.75px line box that `text-sm leading-relaxed` already reserves. Lines with
 * and without chips therefore sit on the same baseline grid, before and after a
 * wrap. The keyword hexagon spends its hairline as padding on an outer frame
 * rather than as a border, so it measures the same 18px and shares that grid.
 *
 * Within that line box the chips are centered on the paragraph's *cap* band
 * rather than its x-height band (`align-cap-middle`, OPT-678). Plain
 * `vertical-align: middle` centers a box on `baseline + xHeight/2`, but a
 * reader judges a chip against the capitals beside it, so a middle-aligned chip
 * reads (capHeight − xHeight)/2 low — a measured 1.06px at this 14px size,
 * which is exactly the sag [Trigger] showed. The utility carries the
 * correction and its derivation; nothing here depends on the number.
 *
 * Spacing between a chip and its neighboring words comes from the source text's
 * own interior spacing (carried through by the parser and preserved by
 * `whitespace-pre-wrap`) plus the chip's internal padding — the chips carry no
 * margins, so nothing shifts when a paragraph rewraps at a different width.
 */

/**
 * Static family → utility map. Written out in full rather than composed, so
 * Tailwind sees every class literally. `keyword` is absent: on a printed card
 * an evergreen keyword is not a plaque at all but a bright orange hexagon, and
 * it is built from its own two layers below.
 */
const NOTATION_CHIP_STYLES: Record<
  Exclude<EffectNotationFamily, "keyword">,
  string
> = {
  timing: "bg-effect-timing text-effect-notation-fg",
  counter: "bg-effect-counter text-effect-notation-fg",
  modifier: "bg-effect-modifier text-effect-notation-fg",
  don: "bg-effect-don text-effect-notation-fg",
  trigger: "bg-effect-trigger text-effect-trigger-fg",
};

const CHIP_BASE = "inline-block align-cap-middle leading-4 whitespace-nowrap";

/** Type set on every notation chip, whatever shape it takes. */
const NOTATION_LABEL = "text-xs font-semibold";

/**
 * Rectangular notation chips. 4px of horizontal padding (OPT-674): these chips
 * are read as part of a sentence, and 8px opened a gap wide enough that a chip
 * looked like its own column rather than a word.
 */
const NOTATION_CHIP_BASE = cn(
  CHIP_BASE,
  NOTATION_LABEL,
  "rounded border border-effect-notation-edge px-1"
);

/** [Trigger] matches the printed card's square, borderless yellow banner. */
const TRIGGER_CHIP_BASE = cn(CHIP_BASE, NOTATION_LABEL, "px-1");

/**
 * The keyword hexagon (OPT-677). `clip-path` clips borders, so the family's
 * white keyline is reproduced with the two-layer technique from
 * docs/design/SHAPE-LANGUAGE.md: this frame paints the edge color and is
 * clipped to the hexagon, and the fill below sits one hairline inside it with a
 * miter-compensated hexagon of its own. Both polygons live in `globals.css`.
 */
const KEYWORD_CHIP_FRAME = cn(
  CHIP_BASE,
  "effect-hex effect-hex-hairline bg-effect-notation-edge"
);

/**
 * Keeping 8px of horizontal padding — the exception OPT-674 allows this family
 * — because the two points eat into the chip's ends: at the cap line the
 * hexagon's own edge is already ~3px in, so 4px would set the first letter on
 * the slope instead of clear of it.
 */
const KEYWORD_CHIP_FILL = cn(
  NOTATION_LABEL,
  "effect-hex effect-hex-inset block bg-effect-keyword px-2 leading-4 text-effect-keyword-fg"
);

/**
 * Traits are content, not notation — they are the subject of the sentence they
 * sit in — so they keep the paragraph's reading size and take the quietest
 * material in the chip ladder: a soft raised fill, no keyline, secondary text.
 * Their 4px padding — which the rectangular notation chips now share, since
 * OPT-674 brought those down to the same step — is what lets a trait read as
 * one of the sentence's words; the source text already puts a space on either
 * side of it.
 */
const TRAIT_CHIP = cn(
  CHIP_BASE,
  "rounded bg-surface-2 px-1 text-sm font-medium text-content-secondary"
);

function renderSegments(segments: EffectSegment[]) {
  return segments.map((segment, index) => {
    if (segment.kind === "text") {
      return <span key={index}>{segment.text}</span>;
    }

    if (segment.kind === "trait") {
      return (
        <span key={index} className={TRAIT_CHIP} data-effect-trait={segment.label}>
          {segment.label}
        </span>
      );
    }

    if (segment.family === "keyword") {
      return (
        <span
          key={index}
          className={KEYWORD_CHIP_FRAME}
          data-effect-notation="keyword"
        >
          <span className={KEYWORD_CHIP_FILL}>{segment.label}</span>
        </span>
      );
    }

    if (segment.family === "trigger") {
      return (
        <span
          key={index}
          className={cn(TRIGGER_CHIP_BASE, NOTATION_CHIP_STYLES.trigger)}
          data-effect-notation="trigger"
        >
          {segment.label}
        </span>
      );
    }

    return (
      <span
        key={index}
        className={cn(NOTATION_CHIP_BASE, NOTATION_CHIP_STYLES[segment.family])}
        data-effect-notation={segment.family}
      >
        {segment.label}
      </span>
    );
  });
}

export function EffectText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const paragraphs = parseEffectText(text);
  if (paragraphs.length === 0) return null;

  return (
    <div
      className={cn(
        "flex max-w-prose flex-col gap-4 text-sm leading-relaxed text-content-primary",
        className
      )}
    >
      {paragraphs.map((segments, index) => (
        <p key={index} className="whitespace-pre-wrap">
          {renderSegments(segments)}
        </p>
      ))}
    </div>
  );
}
