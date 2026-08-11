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
 * `leading-4` plus a hairline the chip is 18px tall and `align-middle` centers
 * it on the text's midline, which fits inside the 22.75px line box that
 * `text-sm leading-relaxed` already reserves. Lines with and without chips
 * therefore sit on the same baseline grid, before and after a wrap.
 *
 * Spacing between a chip and its neighboring words comes from the source text's
 * own spaces (preserved by `whitespace-pre-wrap`) plus the chip's internal
 * padding — the chips carry no margins, so nothing shifts when a paragraph
 * rewraps at a different width.
 */

/**
 * Static family → utility map. Written out in full rather than composed, so
 * Tailwind sees every class literally.
 */
const NOTATION_CHIP_STYLES: Record<EffectNotationFamily, string> = {
  timing: "bg-effect-timing text-effect-notation-fg",
  keyword: "bg-effect-keyword text-effect-notation-fg",
  counter: "bg-effect-counter text-effect-notation-fg",
  modifier: "bg-effect-modifier text-effect-notation-fg",
  trigger: "bg-effect-trigger text-effect-trigger-fg",
};

const CHIP_BASE = "inline-block rounded align-middle leading-4 whitespace-nowrap";

const NOTATION_CHIP_BASE = cn(
  CHIP_BASE,
  "border border-effect-notation-edge px-2 text-xs font-semibold"
);

/**
 * Traits are content, not notation — they are the subject of the sentence they
 * sit in — so they keep the paragraph's reading size and take the quietest
 * material in the chip ladder: a soft raised fill, no keyline, secondary text.
 * Their padding is half the notation chips': a trait has to read as one of the
 * sentence's words, and the source text already puts a space on either side.
 */
const TRAIT_CHIP = cn(
  CHIP_BASE,
  "bg-surface-2 px-1 text-sm font-medium text-content-secondary"
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
