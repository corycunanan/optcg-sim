import { decodeHtmlEntities } from "./card-parsing.js";

// The five card attributes are rendered as bracketed tokens in effect text,
// either HTML-encoded (`&lt;Slash&gt;`) or with fullwidth brackets (`＜Slash＞`).
// Once entities are decoded, `<Slash>` looks like an HTML tag, so it must be
// unwrapped to the bare name BEFORE tag stripping — otherwise the attribute
// name is silently deleted (e.g. "has the <Slash> attribute" → "has the  attribute").
const ATTRIBUTE_TOKEN = /[<＜](Slash|Strike|Ranged|Special|Wisdom)[>＞]/g;

// Real HTML tags in vegapull text are lowercase (<br>, <i>, <span>); a leftover
// capitalized bracket token after ATTRIBUTE_TOKEN unwrapping means content the
// generic tag-strip below would silently delete (a new/variant attribute token).
// Warn loudly instead of letting the whitespace collapse erase the evidence.
const SUSPICIOUS_TOKEN = /<[A-Z][^>]*>/g;

export function sanitizeEffectText(text: string, warnContext?: string): string {
  if (!text || text === "-") return "";
  const unwrapped = decodeHtmlEntities(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(ATTRIBUTE_TOKEN, "$1");
  const suspicious = unwrapped.match(SUSPICIOUS_TOKEN);
  if (suspicious) {
    console.warn(
      `  ⚠ sanitizeEffectText${warnContext ? ` [${warnContext}]` : ""}: stripping unrecognized token(s) ${suspicious.join(" ")} — if this is a new attribute token, add it to ATTRIBUTE_TOKEN`
    );
  }
  return unwrapped
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
