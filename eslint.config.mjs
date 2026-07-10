import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// OPT-321: shells inject state, never internals.
//
// `<Board>` from `@/components/game/board` is the only authorized consumer of
// zone internals (`board-layout/*`). Shells, page files, and shell-adjacent
// live-only chrome must compose `<Board>` and never import zone components
// directly. Type-only imports are allowed so shared types like
// `InteractionMode` and `BoardLayoutProps` can still flow across the boundary.
//
// See `src/components/game/scaled-board/README.md` for the contract.
const shellContractRule = {
  "@typescript-eslint/no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          group: [
            "@/components/game/board-layout",
            "@/components/game/board-layout/*",
            "**/components/game/board-layout",
            "**/components/game/board-layout/*",
          ],
          message:
            "Shell-contract violation: zone internals in `board-layout/` must be composed via `<Board>` from `@/components/game/board`, not imported directly. Type-only imports are allowed. See src/components/game/scaled-board/README.md.",
          allowTypeImports: true,
        },
      ],
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "prefer-const": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
  {
    name: "shell-injects-state-only-contract",
    files: [
      "src/app/game/**/*.{ts,tsx}",
      "src/app/sandbox/**/*.{ts,tsx}",
      "src/components/sandbox/**/*.{ts,tsx}",
      "src/components/game/live-game-shell.tsx",
      "src/components/game/event-log.tsx",
      "src/components/game/game-button.tsx",
      "src/components/game/game-error-boundary.tsx",
      "src/components/game/game-ui.tsx",
    ],
    rules: shellContractRule,
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "storybook-static/**",
    "workers/game/.wrangler/**",
    "workers/game/coverage/**",
    // Agent worktrees are full repo copies — linting them is runaway duplicate work.
    ".claude/**",
    "**/.claude/**",
  ]),
]);

export default eslintConfig;
