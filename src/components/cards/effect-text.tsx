import type React from "react";
import { cn } from "@/lib/utils";
import {
  parseEffectText,
  type EffectNotationFamily,
  type EffectSegment,
} from "@/lib/cards/effect-notation";

/**
 * Renders a card's printed rules text the way the card prints it: one paragraph
 * per effect, bracketed notation set as inline chips colored by family,
 * `{Trait}` types set as a quieter inline chip, and the price an effect asks for
 * set in the body face's semibold cut. Everything the notation vocabulary does
 * not recognize — referenced card names such as `[Monkey.D.Luffy]`, reminder
 * text, plain prose — is passed through verbatim.
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
 * margins (traits aside: see TRAIT_CHIP), so nothing shifts when a paragraph
 * rewraps at a different width.
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
 * sit in — so they keep the paragraph's reading size and stay neutral: a
 * hairline edge and white lettering on a fill one step above the surface
 * (`--effect-trait`, which the board's card tooltip re-points at its own
 * neutral fill). The card tooltip's header badges for traits and attributes
 * share this material, so a trait reads the same in a sentence and in a
 * header. 4px of padding keeps the chip reading as one of the sentence's
 * words, and 4px of margin on each side keeps the edge from sitting flush
 * against the neighbouring words once the hairline is drawn.
 */
const TRAIT_CHIP = cn(
  CHIP_BASE,
  "mx-1 rounded border border-effect-trait-edge bg-effect-trait px-1 text-sm font-medium text-effect-trait-fg"
);

/**
 * The price of an effect. Weight is the whole treatment — no size, color, or
 * chip — because the cost is not a different *kind* of thing from the sentence
 * it opens, it is the part of that sentence a player checks first. Public Sans
 * carries 600, so this is a real cut rather than a synthesized one, and weight
 * alone means the emphasis survives however the paragraph rewraps.
 *
 * `<span>` rather than `<strong>` on purpose: the cost boundary is recognized by
 * a grammar over printed text, not read off structured data, so the markup does
 * not claim more about the run than the parser actually knows.
 */
const COST = "font-semibold";

function renderSegments(segments: EffectSegment[]): React.ReactNode[] {
  return segments.map((segment, index) => {
    if (segment.kind === "text") {
      return <span key={index}>{segment.text}</span>;
    }

    if (segment.kind === "cost") {
      return (
        <span key={index} className={COST} data-effect-cost="">
          {renderSegments(segment.segments)}
        </span>
      );
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

/**
 * One already-parsed line of effect text, rendered with the same chips as
 * `EffectText`. Surfaces that own their own paragraph structure (the board's
 * card tooltip greys and annotates each clause separately) render each line
 * through this so the chips cannot drift from the card database.
 */
export function EffectSegments({ segments }: { segments: EffectSegment[] }) {
  return <>{renderSegments(segments)}</>;
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
