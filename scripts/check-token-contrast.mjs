import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { converter, parse, wcagContrast } from "culori";

const globalsPath = fileURLToPath(
  new URL("../src/app/globals.css", import.meta.url)
);
const manifestPath = fileURLToPath(
  new URL("./contrast-pairs.json", import.meta.url)
);
const toRgb = converter("rgb");

// Add a manifest entry whenever a new semantic foreground/background pairing
// is introduced. Theme presets must override primitives in html[data-theme]
// blocks; every discovered preset is checked against this same manifest.

function declarationsFrom(body) {
  const declarations = new Map();
  const declarationPattern = /(--[\w-]+)\s*:\s*([^;]+);/g;

  for (const match of body.matchAll(declarationPattern)) {
    declarations.set(match[1], match[2].trim());
  }

  return declarations;
}

function parseThemeTokens(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  const defaultTokens = new Map();
  const themeOverrides = new Map();

  for (const match of withoutComments.matchAll(blockPattern)) {
    const selectors = match[1].split(",").map((selector) => {
      const afterAtRules = selector.split(";").at(-1);
      return afterAtRules.trim();
    });
    const declarations = declarationsFrom(match[2]);

    for (const selector of selectors) {
      if (selector === ":root") {
        for (const entry of declarations) defaultTokens.set(...entry);
        continue;
      }

      const themeMatch = selector.match(
        /^(?:html|:root)?\[data-theme=(?:"([^"]+)"|'([^']+)'|([^\]\s]+))\]$/
      );
      if (!themeMatch) continue;

      const themeName = themeMatch[1] ?? themeMatch[2] ?? themeMatch[3];
      const overrides = themeOverrides.get(themeName) ?? new Map();
      for (const entry of declarations) overrides.set(...entry);
      themeOverrides.set(themeName, overrides);
    }
  }

  if (defaultTokens.size === 0) {
    throw new Error(`No :root token declarations found in ${globalsPath}`);
  }

  const themes = new Map([["default", defaultTokens]]);
  for (const [themeName, overrides] of themeOverrides) {
    themes.set(themeName, new Map([...defaultTokens, ...overrides]));
  }

  return themes;
}

function resolveToken(tokenName, tokens, resolving = []) {
  if (resolving.includes(tokenName)) {
    throw new Error(
      `Circular token reference: ${[...resolving, tokenName].join(" -> ")}`
    );
  }

  const value = tokens.get(tokenName);
  if (value === undefined) {
    throw new Error(`Token ${tokenName} is not declared`);
  }

  const reference = value.match(/^var\((--[\w-]+)\)$/);
  if (!reference) return value;

  return resolveToken(reference[1], tokens, [...resolving, tokenName]);
}

function parseRgb(value, tokenName, themeName) {
  const color = parse(value);
  const rgb = color && toRgb(color);

  if (!rgb) {
    throw new Error(
      `[${themeName}] ${tokenName} resolves to unsupported color "${value}"`
    );
  }

  return rgb;
}

function composite(foreground, background) {
  const alpha = foreground.alpha ?? 1;

  return {
    mode: "rgb",
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
  };
}

function contrastFor(pairing, tokens, themeName) {
  const foregroundValue = resolveToken(pairing.foreground, tokens);
  const backgroundValue = resolveToken(pairing.background, tokens);
  const foreground = parseRgb(foregroundValue, pairing.foreground, themeName);
  const background = parseRgb(backgroundValue, pairing.background, themeName);

  if ((background.alpha ?? 1) !== 1) {
    throw new Error(
      `[${themeName}] ${pairing.background} must resolve to an opaque surface`
    );
  }

  return wcagContrast(composite(foreground, background), background);
}

function validateManifest(manifest) {
  if (!Array.isArray(manifest.pairings) || manifest.pairings.length === 0) {
    throw new Error(`${manifestPath} must declare a non-empty pairings array`);
  }

  const names = new Set();
  for (const pairing of manifest.pairings) {
    if (
      typeof pairing.name !== "string" ||
      typeof pairing.foreground !== "string" ||
      typeof pairing.background !== "string" ||
      typeof pairing.minimum !== "number"
    ) {
      throw new Error(`Invalid contrast pairing: ${JSON.stringify(pairing)}`);
    }
    if (names.has(pairing.name)) {
      throw new Error(`Duplicate contrast pairing name: ${pairing.name}`);
    }
    names.add(pairing.name);
  }
}

async function main() {
  const [css, manifestSource] = await Promise.all([
    readFile(globalsPath, "utf8"),
    readFile(manifestPath, "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource);
  validateManifest(manifest);

  const themes = parseThemeTokens(css);
  const failures = [];

  for (const [themeName, tokens] of themes) {
    console.log(`Theme: ${themeName}`);

    for (const pairing of manifest.pairings) {
      const ratio = contrastFor(pairing, tokens, themeName);
      const passed = ratio >= pairing.minimum;
      const result = passed ? "PASS" : "FAIL";
      console.log(
        `  ${result} ${pairing.name} (${pairing.foreground} on ${pairing.background}): ${ratio.toFixed(2)}:1 (minimum ${pairing.minimum.toFixed(2)}:1)`
      );

      if (!passed) failures.push({ pairing, ratio, themeName });
    }
  }

  if (failures.length > 0) {
    console.error(
      `\nContrast check failed: ${failures.length} pairing${failures.length === 1 ? "" : "s"} below WCAG AA.`
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `\nContrast check passed: ${manifest.pairings.length} pairings across ${themes.size} theme${themes.size === 1 ? "" : "s"}.`
  );
}

main().catch((error) => {
  console.error(`Contrast check could not run: ${error.message}`);
  process.exitCode = 1;
});
