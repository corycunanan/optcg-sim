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
    "src/app/admin/cards/new/page.tsx": ["background", "borderColor", "color"],
    "src/app/decks/deck-list-filter.tsx": ["background"],
    "src/components/deck-builder/deck-builder-search.tsx": ["background"],
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
// The 45° chamfer vocabulary is ADDITIVE: the `chamfer-*` utilities and the
// `--chamfer-*` / `--edge-*` tokens declared in globals.css are *permitted*
// wherever a surface opts into the angular register. Nothing here makes a
// chamfer required, and the three-radius rule stays in force everywhere else —
// a component that keeps `rounded`/`rounded-md`/`rounded-lg` is still correct.
//
// Two mechanical checks are scoped entirely to the new vocabulary:
//
// 1. Anti-rot — a `chamfer-*` class referenced from .tsx must actually be
//    declared in globals.css. Without it a renamed or deleted utility degrades
//    silently into an unclipped rectangle, which is invisible in review.
// 2. No dynamic composition — Tailwind's scanner only sees whole class names
//    in the source, so `` `chamfer-cut-${cut}` `` compiles to nothing. Chamfer
//    classes must come from static literal maps.
//
// Both checks are scoped to *class positions* — a `className`/`class` JSX
// attribute, or an argument of `cn()` / `cva()` / `clsx()` — descending only
// through the expression forms those helpers evaluate as classes (conditional,
// logical, array, object). A `chamfer-` string anywhere else in a .tsx file is
// not a class and is never inspected, so selector strings, `data-*` values,
// identifiers, and module specifiers cannot produce a finding. No other
// allowlist is widened by these rules.
const GLOBALS_CSS_PATH = join(SOURCE_ROOT, "app", "globals.css");
const CLASS_ATTRIBUTE_NAMES = new Set(["className", "class"]);
const CLASS_HELPER_NAMES = new Set(["cn", "cva", "clsx", "classNames"]);
const CLASS_LOGICAL_OPERATORS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);
// A complete class name never ends in a hyphen; a dangling `chamfer-cut-` is
// the prefix half of a dynamic composition, reported by that rule instead.
const SHAPE_CLASS_TOKEN_RE = /^chamfer-[a-z](?:[a-z0-9-]*[a-z0-9])?$/;
const SHAPE_FRAGMENT_RE = /(?:^|\s)(chamfer-[a-z0-9-]*)/;
const SHAPE_DECLARATION_RE = /(?:@utility\s+|\.)(chamfer-[a-z][a-z0-9-]*)/g;

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
];
const SPACING_RE =
  /(?<![\w-])-?(?:p[trblxy]?|m[trblxy]?|gap(?:-[xy])?|space-[xy]|top|right|bottom|left|inset(?:-[xy])?|start|end|translate-[xy])-(?:([0-9]+(?:\.[0-9]+)?)|\[([^\]\r\n]+)\])(?:!)?(?![\w.])/g;

const IS_MAIN =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
const files = IS_MAIN ? collectTsxFiles(SOURCE_ROOT) : [];
const declaredShapeUtilities = IS_MAIN
  ? collectDeclaredShapeUtilities(readFileSync(GLOBALS_CSS_PATH, "utf8"))
  : new Set();
const violations = [];
let buttonOverrideCount = 0;
let exemptSpacingFileCount = 0;
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

    for (const usage of findShapeVocabularyUsages(source)) {
      if (usage.kind === "dynamic") {
        addViolation(
          path,
          sourceFile,
          usage.index,
          "shape-vocabulary",
          `dynamically composed chamfer class ${JSON.stringify(`${usage.utility}\${…}`)}; Tailwind only sees whole class names, so select from a static literal map`
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
        `undeclared chamfer utility ${JSON.stringify(usage.utility)}; declare it in src/app/globals.css per docs/design/SHAPE-LANGUAGE.md`
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
 * Every `chamfer-*` class reference in a .tsx source, as
 * `{ index, utility, kind }`.
 *
 * Only *class positions* are inspected: a `className`/`class` JSX attribute, or
 * an argument of a class helper (`cn`/`cva`/`clsx`/`classNames`). Within one,
 * descent follows the expression forms those helpers evaluate as classes —
 * string literals, conditionals, `&&`/`||`/`??`, arrays, object keys and
 * values, and nested helper calls. Nothing outside a class position is
 * examined, so `const status = "chamfer-example"`, `querySelector(...)`,
 * `data-slot={...}`, and module specifiers can never produce a finding.
 *
 * - `kind: "class"` — a static literal class token. Always allowed; only a name
 *   missing from globals.css is a violation.
 * - `kind: "dynamic"` — a non-literal expression in a class position whose
 *   string parts contain a `chamfer-` token (template substitution, `+`
 *   concatenation, `[...].join()`, …). Tailwind only ever sees whole class
 *   names, so this is always a violation.
 */
export function findShapeVocabularyUsages(source) {
  const sourceFile = ts.createSourceFile(
    "scan.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const usages = [];
  const scanned = new Set();

  const record = (node, utility, kind) => {
    usages.push({ index: node.getStart(sourceFile), utility, kind });
  };

  /** Walks one class-position expression. */
  const scanClassExpression = (node) => {
    if (!node || scanned.has(node)) return;
    scanned.add(node);

    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isJsxExpression(node)
    ) {
      scanClassExpression(node.expression);
      return;
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      for (const utility of shapeClassTokens(node.text)) {
        record(node, utility, "class");
      }
      return;
    }

    if (ts.isConditionalExpression(node)) {
      scanClassExpression(node.whenTrue);
      scanClassExpression(node.whenFalse);
      return;
    }

    if (
      ts.isBinaryExpression(node) &&
      CLASS_LOGICAL_OPERATORS.has(node.operatorToken.kind)
    ) {
      scanClassExpression(node.left);
      scanClassExpression(node.right);
      return;
    }

    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) scanClassExpression(element);
      return;
    }

    if (ts.isObjectLiteralExpression(node)) {
      // clsx keys its classes; cva nests them as variant values.
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name = property.name;
        if (
          ts.isStringLiteral(name) ||
          ts.isNoSubstitutionTemplateLiteral(name)
        ) {
          scanClassExpression(name);
        } else if (ts.isComputedPropertyName(name)) {
          scanClassExpression(name.expression);
        }
        scanClassExpression(property.initializer);
      }
      return;
    }

    if (isClassHelperCall(node)) {
      for (const argument of node.arguments) scanClassExpression(argument);
      return;
    }

    // Anything else here is composed at runtime. It is only a finding when it
    // actually carries chamfer text; plain identifiers stay silent.
    const fragment = firstShapeFragment(node);
    if (fragment) record(node, fragment, "dynamic");
  };

  const visit = (node) => {
    if (
      ts.isJsxAttribute(node) &&
      CLASS_ATTRIBUTE_NAMES.has(node.name.getText()) &&
      node.initializer
    ) {
      scanClassExpression(node.initializer);
    } else if (isClassHelperCall(node) && !scanned.has(node)) {
      scanned.add(node);
      for (const argument of node.arguments) scanClassExpression(argument);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return usages;
}

function isClassHelperCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    CLASS_HELPER_NAMES.has(node.expression.text)
  );
}

/** Whole `chamfer-*` class tokens in a literal, ignoring variant prefixes. */
function shapeClassTokens(text) {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/^!/, "").split(":").at(-1))
    .filter((token) => SHAPE_CLASS_TOKEN_RE.test(token));
}

/** The first `chamfer-` fragment in any string part of an expression tree. */
function firstShapeFragment(node) {
  let found = null;

  const check = (text) => {
    if (found) return;
    const match = SHAPE_FRAGMENT_RE.exec(text);
    if (match) found = match[1];
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

/** Chamfer utilities declared in globals.css, as `@utility` or a class rule. */
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
    `Inline-style exceptions: ${INLINE_STYLE_FILE_EXEMPTIONS.size} documented file/property allowlist entries.`
  );
  console.log(
    `Button className overrides: ${buttonOverrideCount} (informational).`
  );
  console.log(
    `Shape language: ${declaredShapeUtilities.size} chamfer utilities declared in globals.css, ${shapeUtilityUsageCount} allowed usage(s) in .tsx.`
  );
}
