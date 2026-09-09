# Target instructions — OPT-775

PR: https://github.com/corycunanan/optcg-sim/pull/643
State: implementation complete; coordinator readiness and independent review pending.

The worker now attaches optional succinct instructions to action target prompts. The modal footer prefers that instruction and retains selection/aggregate suffixes; the printed effect clause stays in the body. Unsupported targeting/filter forms omit the field. No banner or routing redesign is included.

Read `workers/game/src/engine/effect-resolver/target-instruction.ts` first, then `target-resolver.ts`, `workers/game/src/__tests__/opt-775-target-instruction.test.ts`, and its golden snapshot. `TARGET_ACTION_PRESENTATION` is the action-keyed extension point for OPT-779. Wire and persistence schemas accept older prompts without `instruction`.

Recovery corrected TOP/BOTTOM deck wording (the action contract is `docs/game-engine/04-ACTIONS.md`, RETURN_TO_DECK), retained singular-target counts, and conservatively falls back for simultaneous color/state filters. The full inventory includes non-action targets as explicit fallbacks: 2,535 target blocks, 1,977 generated, 558 fallback, 681 distinct instructions. The original action-only inventory omitted 317 target blocks. Cost prompt wording remains printed-clause fallback; those targets are now counted.

Verification: baseline worker suite at dbebb756 passed 218 files / 2,340 tests. A resolver-boundary TOP regression failed against the old bottom-only wording; TOP, BOTTOM and default cases now pass. The replacement selection-invariance test uses real resolver filtering with own/opponent and active/rested candidates, and checks both the outgoing prompt and stored continuation. Focused suite: 18 passed. The first full verify passed all checks except its font-fetching build under network restrictions; the integrated final gate is recorded in the PR body.

Coordinator desktop VQA at 1680×875 observed short/long/fallback variants, long footer wrapping with reachable buttons, and keyboard Tab/Space selection with the selected-count suffix. No mobile verification is claimed. The temporary local harness was removed and is not part of this PR.

No implementation follow-up is required for this bounded ticket. OPT-779 and OPT-776 may consume the instruction/presentation contract after this PR is verified merged; no stacking was authorized. Unsupported forms are deliberately visible in schema lint rather than assigned fabricated instructions.
