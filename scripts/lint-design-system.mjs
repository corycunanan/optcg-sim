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
    "src/app/decks/page.tsx": ["background"],
    "src/components/cards/card-filters.tsx": [
      "background",
      "borderColor",
      "color",
    ],
    "src/components/deck-builder/deck-builder-search.tsx": ["background"],
    "src/components/deck-builder/deck-builder-stats.tsx": [
      "background",
      "opacity",
    ],
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
const violations = [];
let buttonOverrideCount = 0;
let exemptSpacingFileCount = 0;

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
}
