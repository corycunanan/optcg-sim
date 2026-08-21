/**
 * Mechanical checks for design-system rules that are safe to enforce with
 * source-text matching. Spacing covers box rhythm plus positional/inset and
 * translation utilities: padding, margin, gap, space, top/right/bottom/left,
 * inset(-x/-y), start/end, and translate(-x/-y). Width, height, and size are
 * intentionally excluded because dimensions are not box-spacing rhythm.
 *
 * Comment contents are stripped before regex matching. This remains a
 * pragmatic text scan rather than a JSX parser, so matching syntax inside
 * string literals in non-className positions can still produce a false
 * positive.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOT = join(REPO_ROOT, "src");

const ALLOWED_SPACING_STEPS = new Set([
  "0", // Resets do not add space and are safe outside the positive scale.
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "8",
  "10",
  "12",
  "16",
]);

// Ratified policy: these are vendored shadcn internals. App code has no spacing
// exemptions; add a design-system token instead of extending this list.
const SPACING_EXEMPT_PATH_PREFIXES = ["src/components/ui/"];

// Radius is not vendored-policy-exempt: the sanctioned rounded/rounded-md/
// rounded-lg scale applies to every component, including src/components/ui/.
// `rounded-none` remains available as a reset, and `rounded-full` is governed
// by semantic review because source-text lint cannot identify people imagery.
// Do not add a radius path allowlist; migrate a component to the nearest scale
// step or document a deliberately separate shape vocabulary instead.
//
// `rounded-card` is that second route, taken once (OPT-715): the card
// silhouette is a documented vocabulary declared in globals.css, not a path
// exemption, and it is policed by the shape-vocabulary rules below rather than
// by widening this scale.

// Inline styles are reserved for values Tailwind cannot know at build time:
// measured geometry, board coordinates, and animation transforms. Visual design
// properties fail unless an exact file/property pair is documented below.
const INLINE_STYLE_PROPERTY_ALLOWLIST = new Set([
  "backfaceVisibility",
  "bottom",
  "gap",
  "gridTemplateColumns",
  "height",
  "left",
  "margin",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "marginTop",
  "maxHeight",
  "maxWidth",
  "minHeight",
  "minWidth",
  "perspective",
  "position",
  "right",
  "rotate",
  "rotateX",
  "rotateY",
  "scale",
  "scaleX",
  "scaleY",
  "top",
  "transform",
  "transformOrigin",
  "transformStyle",
  "width",
  "x",
  "y",
  "zIndex",
]);

// Legitimate dynamic, token-backed visual values. Exemptions are property-scoped
// so another inline design property in the same file will still fail.
const INLINE_STYLE_FILE_EXEMPTIONS = new Map(
  Object.entries({
    // Theme-variable feeds for the branded Google button.
    "src/app/(auth)/login/google-sign-in-button.tsx": [
      "background",
      "border",
      "color",
    ],
    // Functional card-color accents and selectors.
    "src/app/admin/cards/[id]/page.tsx": ["borderLeft"],
    "src/app/decks/deck-list-filter.tsx": ["background"],
    // Fixed map-art treatments.
    "src/app/page.tsx": ["backgroundImage", "filter"],
    // Runtime board, drag, and animation state.
    "src/components/game/arrange-top-cards-modal.tsx": [
      "opacity",
      "transformPerspective",
      "transition",
    ],
    "src/components/game/board-layout/board-drag-overlay.tsx": [
      "transformPerspective",
    ],
    "src/components/game/board-layout/board-layout.tsx": ["zoom"],
    "src/components/game/board-layout/card-animation-layer.tsx": [
      "pointerEvents",
    ],
    "src/components/game/board-layout/don-zone.tsx": ["cursor"],
    "src/components/game/board-layout/hand-layer.tsx": [
      "cursor",
      "touchAction",
      "transition",
      "visibility",
    ],
    // Responsive card-column edge fades.
    "src/components/home/CardColumns.tsx": ["maskImage", "WebkitMaskImage"],
  }).map(([path, properties]) => [path, new Set(properties)])
);

// Every CSS custom property assigned through a JSX inline-style object. These
// are runtime feeds consumed by token-backed component classes; no other --*
// property is implicitly allowed.
const INLINE_STYLE_CUSTOM_PROPERTY_ALLOWLIST = new Map(
  Object.entries({
    "src/components/ui/sidebar.tsx": [
      "--sidebar-width",
      "--sidebar-width-icon",
      "--skeleton-width",
    ],
    "src/components/ui/sonner.tsx": [
      "--normal-bg",
      "--normal-text",
      "--normal-border",
      "--border-radius",
    ],
  }).map(([path, properties]) => [path, new Set(properties)])
);

// ── Shape language allowance (docs/design/SHAPE-LANGUAGE.md) ──
// Two vocabularies live outside the three-radius chrome scale, and both are
// declared in globals.css rather than allowlisted here:
//
// - `chamfer-*` — the 45° angular register, consumed through `ChamferFrame`
//   over the `--chamfer-*` / `--edge-*` tokens.
// - `rounded-card` — the card silhouette, over `--card-radius`. §Shape
//   semantics reserves rounded geometry for card faces, thumbnails, and art
//   crops, so this is the one radius a raw-card surface may take, and it is
//   what its hard cast traces (ELEVATION-LANGUAGE.md §Casting from a clipped
//   surface).
//
// Both are ADDITIVE: a surface may adopt either, none is required to, and the
// three-radius rule stays in force everywhere else — a component that keeps
// `rounded`/`rounded-md`/`rounded-lg` is still correct.
//
// The rules are derived from the *documented vocabulary*, not from a survey of
// current usage, so a name this project has not written yet is judged the same
// way as one it has. Two mechanical checks are scoped entirely to that
// vocabulary:
//
// 1. Anti-rot — a vocabulary class referenced from .tsx must actually be
//    declared in globals.css. Without it a renamed or deleted utility degrades
//    silently into an unclipped rectangle or a square-cornered card, which is
//    invisible in review. This is also what catches a near-miss name:
//    `rounded-card-lg` reads as vocabulary and fails as undeclared, where the
//    chrome-radius rule below would never have looked at it.
// 2. No dynamic composition — Tailwind's scanner only sees whole class names
//    in the source, so `` `chamfer-cut-${cut}` `` compiles to nothing. These
//    classes must come from static literal maps.
//
// Both checks are scoped to *class positions* — a `className`/`class` JSX
// attribute, or an argument of `cn()` / `cva()` / `clsx()` — descending only
// through the expression forms those helpers evaluate as classes (conditional,
// logical, array, object). A `chamfer-` or `rounded-card` string anywhere else
// in a .tsx file is not a class and is never inspected, so selector strings,
// `data-*` values, identifiers, and module specifiers cannot produce a
// finding. No other allowlist is widened by these rules.
const GLOBALS_CSS_PATH = join(SOURCE_ROOT, "app", "globals.css");
const CLASS_ATTRIBUTE_NAMES = new Set(["className", "class"]);
const CLASS_HELPER_NAMES = new Set(["cn", "cva", "clsx", "classNames"]);
const CLASS_LOGICAL_OPERATORS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);
const SHAPE_DECLARATION_RE =
  /(?:@utility\s+|\.)((?:chamfer-[a-z]|rounded-card)[a-z0-9-]*)/g;

// ── The radius closed world ──
// Every `rounded-*` class resolves to exactly one of two things: a documented
// chrome step (BRANDING-GUIDELINES.md §6) or a shape utility declared in
// globals.css. Nothing else exists, so the rule is a membership test against
// those two sets rather than a list of bad spellings — which is the only way
// it can catch a name nobody predicted. `rounded-crad` fails here; so does
// `rounded-card-lg`, and so did `rounded-tl-sm`, a real off-scale corner the
// old pattern-shaped rule stepped over for as long as it existed.
//
// Longer corner keys come first so `rounded-tl-sm` reads as corner `tl` value
// `sm` rather than as the value `tl-sm`.
const RADIUS_CORNER_KEYS = "tl|tr|bl|br|ss|se|es|ee|t|r|b|l|s|e";
const RADIUS_CLASS_RE = new RegExp(
  `^rounded(?:-(?:${RADIUS_CORNER_KEYS}))?(?:-(.+))?$`
);
// The documented chrome scale. `""` is the bare `rounded` (4px badges).
const CHROME_RADIUS_VALUES = new Set(["", "none", "full", "md", "lg"]);
// Namespaces Tailwind itself owns. A declared utility inside one of these
// cannot claim the namespace as its own prefix — `rounded-md` is not shape
// vocabulary just because `rounded-card` is.
const STOCK_UTILITY_NAMESPACES = new Set(["rounded"]);
// Values the border-radius text rule already reports with a better message, so
// this rule stays quiet on them rather than double-reporting.
const TEXT_RULE_RADIUS_VALUES = new Set(["xs", "sm", "xl", "2xl", "3xl"]);

// Elevation shadows are hard, non-blurred offsets (globals.css, "Shadow
// values"). The `shadow` rules therefore fail three things.
//
// 1. Every stock Tailwind shadow utility that is not backed by an elevation
//    token. Only `--shadow-sm/md/lg` are retokenized to hard offsets, so
//    `shadow-sm/md/lg` (and the `*-none` resets) are the whole allowed set.
//    Everything else in the stock ramps still resolves to Tailwind's own
//    blurred values — including the bare `shadow`, `drop-shadow`, and
//    `shadow-inner` compat keys that tailwindcss/theme.css keeps in its
//    "Deprecated" block, and the separate `--inset-shadow-*` namespace, which
//    this project never retokenizes.
// 2. An arbitrary `shadow-[…]` whose value actually carries blur.
// 3. The bare `shadow` class. `shadow` is also an ordinary English word, so it
//    is matched only in a real class position (see findClassTokenViolations)
//    rather than by a text scan that would fire on prose and on class-name
//    string fixtures in tests. The hyphenated bare forms are unambiguous and
//    stay in the text rules.
//
// An arbitrary value is read structurally rather than allowlisted by path. Each
// comma-separated layer drops `inset` and a leading/trailing <color> — a
// *proven* color, either a literal or a color function; an unresolved
// `calc()`/`var()` is not assumed to be one and keeps its slot — leaving
// <offset-x> <offset-y> <blur> <spread> positions, and passes only when:
//
// - No position holds a literal length (`shadow-[var(--shadow-lg)]`) — a token
//   reference. Lint only scans .tsx, so token *values* are guarded by review
//   and docs/design/BRANDING-GUIDELINES.md §7, not by this rule.
// - There is no third position at all, so the layer cannot carry blur.
// - Both offsets are literal zero (`shadow-[0_0_18px_var(--gb-signal-*)]`) — a
//   glow, which is a semantic signal and not elevation. Documented intentional
//   in docs/design/INTERACTION-GRAMMAR.md §3.2; a glow is not a drop shadow, so
//   the exemption is the shape of the value itself and needs no file list.
// - The blur position holds a literal zero (`shadow-[0_0_0_1px_…]`) — a hard
//   cast or a hairline.
//
// Anything else is a blurred drop shadow. That deliberately includes a blur
// position occupied by a `calc()`/`var()` this linter cannot resolve: an
// unreadable blur is an unproven blur, so the rule fails closed and the author
// writes the zero out (`0_0_0_var(--x)`) to say a cast is hard.
const SHADOW_LENGTH_RE =
  /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%|vh|vw|ch)?$/i;
const SHADOW_COLOR_FUNCTION_RE =
  /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i;
const SHADOW_COLOR_LITERAL_RE = /^(?:#[0-9a-f]{3,8}|[a-z]+)$/i;
// Stock ramp steps outside the retokenized `shadow-sm/md/lg`, and the bare
// hyphenated compat utilities. `*-none` and `*-[…]` are excluded on purpose:
// the reset is inert and the arbitrary form is owned by the structural rule.
const BLURRED_STOCK_SHADOW_RE =
  /(?<![\w-])(?:shadow-(?:2xs|xs|xl|2xl|inner)|inset-shadow(?:-(?:2xs|xs|sm|md|lg|xl|2xl))?)(?![\w-])/g;
const BLURRED_DROP_SHADOW_RE =
  /(?<![\w-])drop-shadow(?:-(?:2xs|xs|sm|md|lg|xl|2xl))?(?![\w-])/g;
// Bare class names that only a class-position scan may judge.
const BLURRED_STOCK_SHADOW_CLASS_TOKENS = new Set(["shadow"]);

// Type floor (OPT-671). The chrome floor is `text-sm` (14px); `text-xs` (12px)
// survives only as badge anatomy — the Badge primitive, the effect-notation
// chip, and the canonical color chip. Every other 12px site moved to 14px, and
// a new one is a regression rather than a local choice.
//
// Like `shadow`, this is judged in *class positions* only (see
// findClassTokenViolations). `text-xs` is also legitimate prose — the class
// name appears in assertions that pin the floor
// (`expect(className).not.toContain("text-xs")`) and in comments documenting
// the sanctioned chip box — and a text scan cannot tell those from a real
// utility. A class list named before use — `const SECTION_LABEL = "…"` then
// `className={SECTION_LABEL}` — is resolved through its same-file declaration
// (localStringConstants); an imported one has no declaration to read and stays
// out of scope, like any other runtime value.
//
// The exemption is by file, never by pattern. A new entry means a new badge
// anatomy and belongs in review, not in a widened regex.
const TYPE_FLOOR_CLASS_TOKENS = new Set(["text-xs"]);
const TYPE_FLOOR_EXEMPT_PATHS = new Set([
  "src/components/ui/badge.tsx",
  "src/components/cards/effect-text.tsx",
  "src/components/cards/color-chip.tsx",
]);

const RULES = [
  {
    name: "font-size",
    regex:
      /(?<![\w-])(?:text-\[(?:length:)?[0-9]+(?:\.[0-9]+)?px\]|\[font-size:[0-9]+(?:\.[0-9]+)?px\])/g,
    describe: (match) =>
      `arbitrary font size ${JSON.stringify(match[0])}; use the Tailwind type scale`,
  },
  {
    name: "raw-color",
    regex: /\[(?:[-\w]+:)?(?:#[0-9a-f]{3,8}|oklch\([^\]\r\n]+\))\]/gi,
    describe: (match) =>
      `raw color ${JSON.stringify(match[0])}; define a token in src/app/globals.css`,
  },
  {
    // The corner group carries every Tailwind corner key, longest first. It
    // used to accept only `-[trbl]` with an optional `-[se]`, which silently
    // let `rounded-tl-sm` through: `tl` never matched, so the whole class read
    // as an unknown value and fell out of the pattern entirely.
    name: "border-radius",
    regex: new RegExp(
      `(?<![\\w-])rounded(?:-(?:${RADIUS_CORNER_KEYS}))?-(?:xs|sm|xl|2xl|3xl|\\[[^\\]\\r\\n]+\\])`,
      "g"
    ),
    describe: (match) =>
      `off-scale radius ${JSON.stringify(match[0])}; use rounded/rounded-md/rounded-lg or an approved shape primitive`,
  },
  {
    name: "shadow",
    regex: BLURRED_STOCK_SHADOW_RE,
    describe: (match) =>
      `blurred stock shadow ${JSON.stringify(match[0])}; use the hard elevation tokens shadow-sm/md/lg`,
  },
  {
    name: "shadow",
    regex: BLURRED_DROP_SHADOW_RE,
    describe: (match) =>
      `blurred drop-shadow filter ${JSON.stringify(match[0])}; use the hard elevation tokens shadow-sm/md/lg`,
  },
  {
    name: "shadow",
    regex: /(?<![\w-])(?:inset-)?(?:drop-)?shadow-\[([^\]\r\n]+)\]/g,
    skip: (match) => firstBlurredShadowLayer(match[1]) === null,
    describe: (match) =>
      `blurred shadow layer ${JSON.stringify(firstBlurredShadowLayer(match[1]))} in ${JSON.stringify(match[0])}; elevation shadows are hard offsets — use shadow-sm/md/lg or shadow-[var(--shadow-*)]`,
  },
];
const SPACING_RE =
  /(?<![\w-])-?(?:p[trblxy]?|m[trblxy]?|gap(?:-[xy])?|space-[xy]|top|right|bottom|left|inset(?:-[xy])?|start|end|translate-[xy])-(?:([0-9]+(?:\.[0-9]+)?)|\[([^\]\r\n]+)\])(?:!)?(?![\w.])/g;

const IS_MAIN =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
const files = IS_MAIN ? collectTsxFiles(SOURCE_ROOT) : [];
const declaredShapeUtilities = collectDeclaredShapeUtilities(
  readFileSync(GLOBALS_CSS_PATH, "utf8")
);
const SHAPE_VOCABULARY = shapeVocabulary(declaredShapeUtilities);
const violations = [];
let buttonOverrideCount = 0;
let exemptSpacingFileCount = 0;
let exemptTypeFloorFileCount = 0;
let shapeUtilityUsageCount = 0;

if (IS_MAIN) {
  for (const absolutePath of files) {
    const path = toRepoPath(absolutePath);
    const source = readFileSync(absolutePath, "utf8");
    const sourceFile = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );

    const spacingExempt = SPACING_EXEMPT_PATH_PREFIXES.some((prefix) =>
      path.startsWith(prefix)
    );
    if (spacingExempt) exemptSpacingFileCount += 1;

    for (const violation of findTextViolations(source, {
      includeSpacing: !spacingExempt,
    })) {
      addViolation(
        path,
        sourceFile,
        violation.index,
        violation.rule,
        violation.message
      );
    }

    const typeFloorExempt = TYPE_FLOOR_EXEMPT_PATHS.has(path);
    if (typeFloorExempt) exemptTypeFloorFileCount += 1;

    for (const violation of findClassTokenViolations(source, {
      includeTypeFloor: !typeFloorExempt,
      includeDeadRadixStateVariants: !path.endsWith(".test.tsx"),
    })) {
      addViolation(
        path,
        sourceFile,
        violation.index,
        violation.rule,
        violation.message
      );
    }

    for (const usage of findShapeVocabularyUsages(source)) {
      if (usage.kind === "dynamic") {
        addViolation(
          path,
          sourceFile,
          usage.index,
          "shape-vocabulary",
          `dynamically composed shape class ${JSON.stringify(`${usage.utility}\${…}`)}; Tailwind only sees whole class names, so select from a static literal map`
        );
        continue;
      }

      shapeUtilityUsageCount += 1;
      if (declaredShapeUtilities.has(usage.utility)) continue;
      addViolation(
        path,
        sourceFile,
        usage.index,
        "shape-vocabulary",
        `undeclared shape utility ${JSON.stringify(usage.utility)}; declare it in src/app/globals.css per docs/design/SHAPE-LANGUAGE.md`
      );
    }

    inspectTsx(sourceFile, path);
  }

  violations.sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      a.line - b.line ||
      a.column - b.column ||
      a.rule.localeCompare(b.rule)
  );

  if (violations.length > 0) {
    console.error(
      `Design-system lint failed with ${violations.length} violation(s):`
    );
    for (const violation of violations) {
      console.error(
        `${violation.path}:${violation.line}:${violation.column} [${violation.rule}] ${violation.message}`
      );
    }
    console.error("");
    printInfo();
    process.exitCode = 1;
  } else {
    console.log(
      `Design-system lint passed (${files.length} .tsx files checked).`
    );
    printInfo();
  }
}

function collectTsxFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectTsxFiles(path);
      return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
    })
    .sort();
}

export function findTextViolations(source, { includeSpacing = true } = {}) {
  const scanSource = stripComments(source);
  const matches = [];

  for (const rule of RULES) {
    rule.regex.lastIndex = 0;
    for (const match of scanSource.matchAll(rule.regex)) {
      if (rule.skip?.(match)) continue;
      matches.push({
        index: match.index,
        rule: rule.name,
        message: rule.describe(match),
      });
    }
  }

  if (includeSpacing) {
    SPACING_RE.lastIndex = 0;
    for (const match of scanSource.matchAll(SPACING_RE)) {
      const scaleStep = match[1];
      const arbitraryValue = match[2];
      if (scaleStep && ALLOWED_SPACING_STEPS.has(scaleStep)) continue;

      matches.push({
        index: match.index,
        rule: "spacing",
        message: `${arbitraryValue ? "arbitrary" : "off-scale"} spacing ${JSON.stringify(match[0])}; allowed positive steps are 1/2/3/4/5/6/8/10/12/16`,
      });
    }
  }

  return matches.sort(
    (a, b) => a.index - b.index || a.rule.localeCompare(b.rule)
  );
}

/**
 * The shape vocabulary, derived entirely from what globals.css declares.
 *
 * Nothing in here is a spelling this file guessed at. `declared` is the parsed
 * `@utility` set; everything else is computed from it, so adding a utility to
 * globals.css extends the rules and removing one contracts them.
 *
 * - `namespacePrefixes` — the project-owned namespace each utility lives in
 *   (`chamfer-`). A declared name in a *stock Tailwind* namespace is excluded,
 *   because that namespace has its own closed world of valid values and is
 *   policed by the radius rule instead. Without that split, `rounded-` as a
 *   prefix would swallow every legitimate `rounded-md` in the codebase.
 * - `radiusValues` — the values a declared `rounded-*` utility contributes to
 *   the radius closed world (`card`).
 * - `stems` — every hyphen-boundary proper prefix of a declared name
 *   (`chamfer-`, `chamfer-cut-`, `rounded-`). A class string that *ends* with
 *   one is the prefix half of a name Tailwind will never see whole.
 */
export function shapeVocabulary(declared) {
  const namespacePrefixes = new Set();
  const radiusValues = new Set();
  const stems = new Set();

  for (const name of declared) {
    const segments = name.split("-");
    for (let end = 1; end < segments.length; end += 1) {
      stems.add(`${segments.slice(0, end).join("-")}-`);
    }

    const namespace = segments[0];
    if (STOCK_UTILITY_NAMESPACES.has(namespace)) {
      if (namespace === "rounded") radiusValues.add(segments.slice(1).join("-"));
      continue;
    }
    namespacePrefixes.add(`${namespace}-`);
  }

  return { declared, namespacePrefixes, radiusValues, stems };
}

/**
 * Every shape-vocabulary class reference in a .tsx source — `chamfer-*` and
 * `rounded-card` — as `{ index, utility, kind }`.
 *
 * Only *class positions* are inspected: a `className`/`class` JSX attribute, or
 * an argument of a class helper (`cn`/`cva`/`clsx`/`classNames`). Within one,
 * descent follows the expression forms those helpers evaluate as classes —
 * string literals, conditionals, `&&`/`||`/`??`, arrays, object keys and
 * values, and nested helper calls. Nothing outside a class position is
 * examined, so `const status = "chamfer-example"`, `querySelector(...)`,
 * `data-slot={...}`, and module specifiers can never produce a finding.
 *
 * - `kind: "class"` — a static literal class token that is a declared name or
 *   sits in a project-owned namespace. Only a name missing from globals.css is
 *   a violation.
 * - `kind: "dynamic"` — a non-literal expression in a class position whose
 *   string parts carry a declared name, or end with one of its stems
 *   (template substitution, `+` concatenation, `[...].join()`, …). Tailwind
 *   only ever sees whole class names, so this is always a violation. Matching
 *   on the *declared name* rather than on a hand-written prefix is what lets
 *   `` `${state}:rounded-card` `` be caught: the name is there, whatever
 *   precedes it.
 */
export function findShapeVocabularyUsages(
  source,
  vocabulary = SHAPE_VOCABULARY
) {
  const usages = [];

  forEachClassPosition(source, {
    onLiteral: (node, index) => {
      for (const token of classTokenNames(node.text)) {
        if (!isShapeVocabularyToken(token, vocabulary)) continue;
        usages.push({ index, utility: token, kind: "class" });
      }
    },
    onDynamic: (node, index) => {
      // Only a finding when it actually carries vocabulary text; plain identifiers
      // stay silent.
      const fragment = firstShapeFragment(node, vocabulary);
      if (fragment) usages.push({ index, utility: fragment, kind: "dynamic" });
    },
  });

  return usages;
}

/**
 * Whether a static class token belongs to the shape vocabulary at all — the
 * question that precedes "is it declared".
 *
 * A declared name always does. So does anything inside a project-owned
 * namespace, which is how a typo (`chamfer-crad`) still reaches the
 * declaration check. A `rounded-*` near miss deliberately does *not*: the
 * radius rule owns that namespace's whole closed world and reports it once.
 */
function isShapeVocabularyToken(token, vocabulary) {
  if (vocabulary.declared.has(token)) return true;
  for (const prefix of vocabulary.namespacePrefixes) {
    if (token.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Whole class tokens banned outright by name, as `{ index, rule, message }`.
 *
 * Text rules cannot own these: `shadow` is an ordinary English word, `text-xs`
 * is the subject of assertions that pin the type floor, and a class-name string
 * fixture (`expect(classes).not.toContain("shadow")`) is not a class position,
 * so only the AST walk can tell a real usage from prose.
 *
 * `includeTypeFloor` is false for the badge-anatomy files listed in
 * TYPE_FLOOR_EXEMPT_PATHS, which own the sanctioned 12px box.
 *
 * The radius rule lives here for the same reason: `rounded-card` is a real
 * class in a class position and a quoted assertion everywhere else, and only
 * the AST walk can tell those apart.
 */
export function findClassTokenViolations(
  source,
  {
    includeTypeFloor = true,
    includeDeadRadixStateVariants = true,
    vocabulary = SHAPE_VOCABULARY,
  } = {}
) {
  const violations = [];

  const reportDeadRadixStateVariant = (token, index) => {
    const deadRadixStateVariant = [
      "data-open:",
      "data-closed:",
      "data-popup-open:",
    ].find((variant) => token.includes(variant));
    if (!includeDeadRadixStateVariants || !deadRadixStateVariant) return;
    violations.push({
      index,
      rule: "radix-data-state",
      message: `dead Radix variant ${JSON.stringify(deadRadixStateVariant)} in ${JSON.stringify(token)}; use data-[state=open]: or data-[state=closed]:`,
    });
  };

  const report = (token, index) => {
    if (includeTypeFloor && TYPE_FLOOR_CLASS_TOKENS.has(token)) {
      violations.push({
        index,
        rule: "type-floor",
        message: `${JSON.stringify(token)} is below the ${JSON.stringify("text-sm")} chrome floor; 12px is reserved for badge internals (Badge, effect chip, color chip)`,
      });
      return;
    }
    const radius = unknownRadiusValue(token, vocabulary);
    if (radius !== null) {
      const known = [...CHROME_RADIUS_VALUES, ...vocabulary.radiusValues]
        .map((value) => (value === "" ? "rounded" : `rounded-${value}`))
        .sort();
      violations.push({
        index,
        rule: "border-radius",
        message: `unknown radius ${JSON.stringify(token)}; the complete set is ${known.join(", ")} (chrome scale in docs/design/BRANDING-GUIDELINES.md §6, shape utilities declared in src/app/globals.css)`,
      });
      return;
    }
    if (!BLURRED_STOCK_SHADOW_CLASS_TOKENS.has(token)) return;
    violations.push({
      index,
      rule: "shadow",
      message: `blurred stock shadow ${JSON.stringify(token)}; use the hard elevation tokens shadow-sm/md/lg`,
    });
  };

  forEachClassPosition(source, {
    onLiteral: (node, index) => {
      for (const rawToken of node.text.split(/\s+/).filter(Boolean)) {
        reportDeadRadixStateVariant(rawToken, index);
        report(normalizeClassToken(rawToken), index);
      }
    },
    // A class list assembled around interpolations still contributes its static
    // halves verbatim, so `` className={`shadow ${extra}`} `` is a real `shadow`.
    onStaticToken: (token, index) => {
      reportDeadRadixStateVariant(token, index);
      report(normalizeClassToken(token), index);
    },
    onDynamic: () => {},
  });

  return violations;
}

/**
 * Walks every class position in a .tsx source, calling `onLiteral(node, index)`
 * for a static class string, `onStaticToken(token, index)` for a whole class
 * name found in the static text of an interpolated template, and
 * `onDynamic(node, index)` for an expression composed at runtime.
 */
function forEachClassPosition(
  source,
  { onLiteral, onDynamic, onStaticToken = () => {} }
) {
  const sourceFile = ts.createSourceFile(
    "scan.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const scanned = new Set();
  const localClassConstants = localStringConstants(sourceFile);
  const shadowedHelpers = locallyShadowedHelperNames(sourceFile);
  const isHelperCall = (node) =>
    isClassHelperCall(node) && !shadowedHelpers.has(node.expression.text);

  /**
   * Walks one class-position expression. `keysAreClasses` is true wherever an
   * object literal's own keys are class names (`clsx`/`cn`) and false inside a
   * `cva` config, whose keys are variant group and option names.
   */
  const scanClassExpression = (node, keysAreClasses = true) => {
    if (!node || scanned.has(node)) return;
    scanned.add(node);

    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isJsxExpression(node)
    ) {
      scanClassExpression(node.expression, keysAreClasses);
      return;
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      onLiteral(node, node.getStart(sourceFile));
      return;
    }

    if (ts.isTemplateExpression(node)) {
      // The substitutions are runtime values and stay out of scope, but the
      // static text around them is class source Tailwind reads verbatim.
      for (const { token, index } of templateStaticTokens(node, sourceFile)) {
        onStaticToken(token, index);
      }
      onDynamic(node, node.getStart(sourceFile));
      return;
    }

    if (ts.isConditionalExpression(node)) {
      scanClassExpression(node.whenTrue, keysAreClasses);
      scanClassExpression(node.whenFalse, keysAreClasses);
      return;
    }

    if (
      ts.isBinaryExpression(node) &&
      CLASS_LOGICAL_OPERATORS.has(node.operatorToken.kind)
    ) {
      scanClassExpression(node.left, keysAreClasses);
      scanClassExpression(node.right, keysAreClasses);
      return;
    }

    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) {
        scanClassExpression(element, keysAreClasses);
      }
      return;
    }

    if (ts.isObjectLiteralExpression(node)) {
      // clsx keys its classes; cva nests them as variant values.
      for (const property of node.properties) {
        if (ts.isShorthandPropertyAssignment(property)) {
          // `clsx({ shadow })` toggles the class named by the key.
          if (keysAreClasses) scanPropertyKey(property.name);
          continue;
        }
        if (!ts.isPropertyAssignment(property)) continue;
        if (keysAreClasses) scanPropertyKey(property.name);
        scanClassExpression(property.initializer, keysAreClasses);
      }
      return;
    }

    if (isHelperCall(node)) {
      for (const argument of node.arguments) {
        scanClassExpression(argument, helperKeysAreClasses(node));
      }
      return;
    }

    // `className={SECTION_LABEL}` is a class list the file wrote down; the
    // indirection is naming, not runtime composition. Every same-file literal
    // declaration of the name is scanned in its own right, so the finding lands
    // on the declaration and is reported once no matter how many elements use
    // it.
    if (ts.isIdentifier(node)) {
      const declarations = localClassConstants.get(node.text);
      if (declarations) {
        for (const declaration of declarations) {
          scanClassExpression(declaration, keysAreClasses);
        }
        return;
      }
    }

    // Anything else here is composed at runtime.
    onDynamic(node, node.getStart(sourceFile));
  };

  /**
   * One object-literal key in a class position. A quoted key and a bare
   * identifier key name the same class — `{ "shadow": on }` and `{ shadow: on }`
   * are the same clsx call — so both are read as class tokens.
   */
  const scanPropertyKey = (name) => {
    if (ts.isIdentifier(name)) {
      onLiteral(name, name.getStart(sourceFile));
      return;
    }
    if (ts.isComputedPropertyName(name)) {
      scanClassExpression(name.expression);
      return;
    }
    scanClassExpression(name);
  };

  const visit = (node) => {
    if (
      ts.isJsxAttribute(node) &&
      CLASS_ATTRIBUTE_NAMES.has(node.name.getText()) &&
      node.initializer
    ) {
      scanClassExpression(node.initializer);
    } else if (isHelperCall(node) && !scanned.has(node)) {
      scanned.add(node);
      for (const argument of node.arguments) {
        scanClassExpression(argument, helperKeysAreClasses(node));
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

/**
 * Whole class names in the static text of an interpolated template, as
 * `{ token, index }`.
 *
 * A fragment that touches a substitution is only half a class name, so the
 * chunk on that side is dropped: `` `shadow-${size}` `` never produces the
 * class `shadow-`, and `` `${scope}shadow` `` never produces `shadow`. Only
 * text fenced off by whitespace — or by the template's own boundary — is a
 * complete class. The dropped halves stay the dynamic rule's business.
 */
function templateStaticTokens(node, sourceFile) {
  const spans = node.templateSpans;
  const fragments = [
    { node: node.head, atStart: true, atEnd: false },
    ...spans.map((span, position) => ({
      node: span.literal,
      atStart: false,
      atEnd: position === spans.length - 1,
    })),
  ];
  const tokens = [];

  for (const fragment of fragments) {
    // `split` leaves an empty entry wherever the text begins or ends with
    // whitespace, which is exactly the "fenced off" signal needed here.
    const chunks = fragment.node.text.split(/\s+/);
    if (!fragment.atStart) chunks.shift();
    if (!fragment.atEnd) chunks.pop();

    const index = fragment.node.getStart(sourceFile);
    for (const chunk of chunks) {
      if (chunk) tokens.push({ token: chunk, index });
    }
  }

  return tokens;
}

/** `cva` keys its variant groups, not its classes; every other helper keys classes. */
function helperKeysAreClasses(node) {
  return node.expression.text !== "cva";
}

/**
 * Every same-file `const NAME = "…"` string literal, as `Map<name, node[]>`.
 *
 * A class list is routinely named before it is used — `const SECTION_LABEL =
 * "text-sm font-semibold …"` then `className={SECTION_LABEL}` — and without
 * this the identifier reads as runtime composition and the class list escapes
 * every by-name rule. Resolving it keeps the rules honest about how the
 * codebase actually writes classes.
 *
 * Deliberately shallow, in both directions:
 *
 * - **Same file only.** An imported constant has no declaration here to read,
 *   so it stays out of scope, exactly like any other runtime value. Shared
 *   class vocabularies belong in a primitive (which the rules do scan), not in
 *   a cross-module string.
 * - **No scope analysis.** A name declared more than once contributes all of
 *   its literal declarations, so a `text-xs` literal is judged wherever it was
 *   written rather than being excused by a same-named sibling.
 *
 * Only string literals are collected. A computed initializer is composed at
 * runtime and keeps its existing treatment.
 */
function localStringConstants(sourceFile) {
  const constants = new Map();

  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isStringLiteral(node.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      const existing = constants.get(node.name.text);
      if (existing) existing.push(node.initializer);
      else constants.set(node.name.text, [node.initializer]);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return constants;
}

/**
 * Class-helper names this file declares for itself.
 *
 * Helper recognition is by name, so an unrelated local `classNames(container)`
 * in a test would otherwise be walked as `clsx`. A name the file defines is not
 * the imported helper, so it is dropped from recognition — for that file only.
 */
function locallyShadowedHelperNames(sourceFile) {
  const shadowed = new Set();

  const visit = (node) => {
    const name =
      ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)
        ? node.name
        : ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
          ? node.name
          : null;
    if (name && CLASS_HELPER_NAMES.has(name.text)) shadowed.add(name.text);

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return shadowed;
}

/** Splits on a separator, ignoring separators nested inside `(…)`. */
function splitTopLevel(value, isSeparator) {
  const parts = [];
  let depth = 0;
  let current = "";

  for (const character of value) {
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;

    if (depth === 0 && isSeparator(character)) {
      parts.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  parts.push(current);
  return parts;
}

/** A `<color>`, which CSS allows on either side of a box-shadow's lengths. */
function isShadowColor(part) {
  return (
    SHADOW_COLOR_LITERAL_RE.test(part) || SHADOW_COLOR_FUNCTION_RE.test(part)
  );
}

/** A length that is provably zero; an unresolved `calc()`/`var()` never is. */
function isZeroShadowLength(part) {
  return SHADOW_LENGTH_RE.test(part) && Number.parseFloat(part) === 0;
}

/**
 * The `<offset-x> <offset-y> <blur> <spread>` slots of one box-shadow layer.
 *
 * Functions are kept: a `calc()`/`var()` occupies its position like any other
 * component, so dropping it would silently slide a blur out of slot three. Only
 * `inset` and a `<color>` — which is not positional — are removed.
 */
function shadowPositionalComponents(layer) {
  const parts = splitTopLevel(
    layer,
    (character) => character === "_" || character === " "
  )
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.toLowerCase() !== "inset");

  if (parts.length > 1 && isShadowColor(parts[0])) parts.shift();
  // Trailing `<color>`: only a *proven* color is non-positional. An unresolved
  // `calc()`/`var()` keeps its slot, so `2px_2px_calc(4px)` still reads as a
  // blur rather than losing its third position to a color that isn't there.
  if (parts.length > 1 && isShadowColor(parts.at(-1))) parts.pop();

  return parts;
}

/**
 * The first blurred-drop-shadow layer inside an arbitrary `shadow-[…]` value,
 * or `null` when every layer is compliant. Tailwind writes the spaces in an
 * arbitrary value as underscores, so both separators are honored.
 *
 * Fails closed: a blur position this linter cannot resolve counts as blur. See
 * the SHADOW_LENGTH_RE comment block for the full pass list.
 */
export function firstBlurredShadowLayer(value) {
  for (const layer of splitTopLevel(value, (character) => character === ",")) {
    const trimmed = layer.trim();
    if (!trimmed) continue;

    const positions = shadowPositionalComponents(trimmed);

    // A layer with no literal length anywhere is a token reference.
    if (!positions.some((part) => SHADOW_LENGTH_RE.test(part))) continue;
    // Without a third position the layer has no blur slot to fill.
    if (positions.length < 3) continue;

    const [offsetX, offsetY, blur] = positions;
    // A cast with no offset is a glow, not elevation.
    if (isZeroShadowLength(offsetX) && isZeroShadowLength(offsetY)) continue;
    if (isZeroShadowLength(blur)) continue;

    return trimmed;
  }

  return null;
}

function isClassHelperCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    CLASS_HELPER_NAMES.has(node.expression.text)
  );
}

/** One class token, stripped of its variant chain and `!` prefixes. */
function normalizeClassToken(token) {
  return token.replace(/^!/, "").replace(/!$/, "").split(":").at(-1);
}

/** Whole class tokens in a literal, stripped of variant and `!` prefixes. */
function classTokenNames(text) {
  return text.split(/\s+/).map(normalizeClassToken).filter(Boolean);
}

/**
 * The radius value of a class token that is not in the closed world, or `null`
 * when the token is a known radius or not a radius at all.
 *
 * Values the border-radius text rule already reports are excluded so a single
 * off-scale class produces one finding, not two.
 */
function unknownRadiusValue(token, vocabulary) {
  const match = RADIUS_CLASS_RE.exec(token);
  if (!match) return null;

  const value = match[1] ?? "";
  if (CHROME_RADIUS_VALUES.has(value)) return null;
  if (vocabulary.radiusValues.has(value)) return null;
  if (TEXT_RULE_RADIUS_VALUES.has(value)) return null;
  // Arbitrary and CSS-variable forms are the text rule's, by shape of value.
  if (/^[[(]/.test(value)) return null;

  return value;
}

/**
 * The first shape-vocabulary fragment in any string part of an expression tree.
 *
 * Two ways a dynamic expression carries vocabulary, both derived from what
 * globals.css declares rather than from a written-out pattern:
 *
 * 1. A declared name appears anywhere in the string. Substring, not
 *    whitespace-anchored, so a variant prefix cannot hide it — that is the
 *    `` `${state}:rounded-card` `` case.
 * 2. A string *ends* with a stem, which is the prefix half of a name split by
 *    an interpolation — `` `rounded-${kind}` ``, `"chamfer-cut-" + cut`.
 *    Ending is the whole test, so a complete `rounded-md` followed by a space
 *    never trips it.
 */
function firstShapeFragment(node, vocabulary) {
  let found = null;

  const check = (text) => {
    if (found) return;
    for (const name of vocabulary.declared) {
      if (text.includes(name)) {
        found = name;
        return;
      }
    }
    for (const stem of vocabulary.stems) {
      if (text.endsWith(stem)) {
        found = stem;
        return;
      }
    }
  };

  const walk = (current) => {
    if (found) return;

    if (
      ts.isStringLiteral(current) ||
      ts.isNoSubstitutionTemplateLiteral(current)
    ) {
      check(current.text);
    } else if (ts.isTemplateExpression(current)) {
      check(current.head.text);
      for (const span of current.templateSpans) check(span.literal.text);
    }

    ts.forEachChild(current, walk);
  };

  walk(node);
  return found;
}

/** Shape utilities declared in globals.css, as `@utility` or a class rule. */
export function collectDeclaredShapeUtilities(css) {
  const declared = new Set();

  SHAPE_DECLARATION_RE.lastIndex = 0;
  for (const match of css.matchAll(SHAPE_DECLARATION_RE)) {
    declared.add(match[1]);
  }

  return declared;
}

export function stripComments(source) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.JSX,
    source
  );
  const chunks = [];
  let sourceIndex = 0;

  for (
    let token = scanner.scan();
    token !== ts.SyntaxKind.EndOfFileToken;
    token = scanner.scan()
  ) {
    if (
      token !== ts.SyntaxKind.SingleLineCommentTrivia &&
      token !== ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      continue;
    }

    const commentStart = scanner.getTokenPos();
    const commentEnd = scanner.getTextPos();
    chunks.push(source.slice(sourceIndex, commentStart));
    chunks.push(
      source.slice(commentStart, commentEnd).replace(/[^\r\n]/g, " ")
    );
    sourceIndex = commentEnd;
  }

  chunks.push(source.slice(sourceIndex));
  return chunks.join("");
}

function inspectTsx(sourceFile, path) {
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (
        node.tagName.getText(sourceFile) === "Button" &&
        findJsxAttribute(node, "className")
      ) {
        buttonOverrideCount += 1;
      }

      const styleAttribute = findJsxAttribute(node, "style");
      const expression = styleAttribute?.initializer?.expression;
      if (styleAttribute && expression) {
        inspectInlineStyle(path, sourceFile, styleAttribute, expression);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

function findJsxAttribute(node, name) {
  return node.attributes.properties.find(
    (property) =>
      ts.isJsxAttribute(property) && property.name.getText() === name
  );
}

function inspectInlineStyle(path, sourceFile, styleAttribute, expression) {
  const fileExemptions = INLINE_STYLE_FILE_EXEMPTIONS.get(path);
  const customPropertyExemptions =
    INLINE_STYLE_CUSTOM_PROPERTY_ALLOWLIST.get(path);

  for (const objectLiteral of findInlineObjectLiterals(expression)) {
    const properties = objectLiteral.properties
      .filter(
        (property) =>
          ts.isPropertyAssignment(property) ||
          ts.isShorthandPropertyAssignment(property)
      )
      .map((property) => propertyName(property.name));
    const disallowed = properties.filter((property) =>
      property.startsWith("--")
        ? !customPropertyExemptions?.has(property)
        : !INLINE_STYLE_PROPERTY_ALLOWLIST.has(property) &&
          !fileExemptions?.has(property)
    );

    if (disallowed.length > 0) {
      addViolation(
        path,
        sourceFile,
        styleAttribute.getStart(sourceFile),
        "inline-style",
        `inline design propert${disallowed.length === 1 ? "y" : "ies"} ${disallowed
          .map((property) => JSON.stringify(property))
          .join(
            ", "
          )}; use Tailwind classes/tokens or document a narrow exception`
      );
    }
  }
}

function findInlineObjectLiterals(expression) {
  if (ts.isObjectLiteralExpression(expression)) return [expression];
  if (ts.isConditionalExpression(expression)) {
    return [
      ...findInlineObjectLiterals(expression.whenTrue),
      ...findInlineObjectLiterals(expression.whenFalse),
    ];
  }
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return findInlineObjectLiterals(expression.expression);
  }
  return [];
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) {
    return name.expression.text;
  }
  return name.getText().replaceAll(/["']/g, "");
}

function addViolation(path, sourceFile, index, rule, message) {
  const location = sourceFile.getLineAndCharacterOfPosition(index);
  violations.push({
    path,
    line: location.line + 1,
    column: location.character + 1,
    rule,
    message,
  });
}

function toRepoPath(absolutePath) {
  return relative(REPO_ROOT, absolutePath).split(sep).join("/");
}

function printInfo() {
  console.log(
    `Spacing exemption: ${SPACING_EXEMPT_PATH_PREFIXES.join(", ")} (${exemptSpacingFileCount} vendored .tsx files skipped).`
  );
  console.log(
    `Type floor: text-sm chrome minimum; ${exemptTypeFloorFileCount}/${TYPE_FLOOR_EXEMPT_PATHS.size} badge-anatomy .tsx files exempt.`
  );
  console.log(
    `Inline-style exceptions: ${INLINE_STYLE_FILE_EXEMPTIONS.size} documented file/property allowlist entries.`
  );
  console.log(
    `Button className overrides: ${buttonOverrideCount} (informational).`
  );
  console.log(
    `Shape language: ${declaredShapeUtilities.size} chamfer/card utilities declared in globals.css, ${shapeUtilityUsageCount} allowed usage(s) in .tsx.`
  );
}
