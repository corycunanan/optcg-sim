# OPT-820 — committed events across prompt continuations

Implemented; independent review and final integration gates remain coordinator-owned. Implementation commit `fa21930f` follows RED regression `02711fbc`; branch `corymcunanan/opt-820-accumulated-events-replay` (PR link in run ledger/PR body).

Read `resume-core.ts`, `resume/events.ts`, `resume/batch.ts`, `resume/cost.ts`, and `session/prompt-lifecycle.ts` first. A frame retains only unpublished committed events; terminal resumes replay them before new events. Successor frames inherit the prefix without duplicating shared references. Existing publication boundaries take and clear committed interrupted prefixes before publishing child events: the trigger drain, a completed simultaneous target plan, and raw replacement batch completion. Rejected targets and unfinished costs never reach those boundaries, so their prefix owners remain unchanged. Batch trigger drains consume their prefix before creating immutable publication copies. Staged cost transactions are excluded; cost events transfer only after successful payment.

Canonical behavior: OP13-082 pays one active DON!! and one hand card, trashes all allied Characters (not K.O.), then plays distinct 5000-power Five Elders from Trash. OP13-080 registers one attack effect and one permanent effect after play. Sources: `docs/cards/OP-13.md` OP13-079/080/082; supported comprehensive rules v1.2.0 §§3-1-6, 8-3-1-1/3/5, 8-6-1-1; `ZONE-TRANSITION-CONTRACT.md`. Zone mutation semantics are unchanged.

| Clause / continuation | Evidence |
| --- | --- |
| Hand payment, allied trash, Elder play in order, no K.O. | New real Imu/Five Elders `runPipeline` + every `resumePromptLifecycle` response; final eventLog, zones and one registration each |
| Repeated target, AND planning, interrupted and batch suffix prompts | New focused continuation tests; full persisted SessionRepository round trip, illegal targets and wrong-player routing |
| Replacement child and raw optional replacement | Persisted nested arrangement, terminal substitute, and replacement play with an On Play hand-cost regressions (pay/decline); outer draw precedes play, payment, child draw and final outer draw |
| Exactly once / immutable events | Batch-prefix/trigger-drain overlap, already published prefix and frozen inputs; original OPT-468/757 suites unchanged |

The hand-cost producer intentionally emits one aggregate `CARD_TRASHED {count:1, reason:"cost", from:"HAND"}` without a private card identity. The regression checks that payload plus the exact paid fixture card leaving Hand and entering Trash, preserving the existing client animation contract (`use-card-transitions.ts`). The older Five Elders test now inspects one continuation output instead of concatenating outputs from pending returns, which double-count replayed events.

Shared inventory (generated registry plus `getNestedActions`): 2,472 schemas, 3,606 blocks, 3,820 actions across 73 types; PLAY_CARD 261, KO 324, RETURN_TO_DECK 74. This is a shared continuation change, not a card encoding sweep. Full worker baseline after implementation: 221 files / 2,361 passed, five pre-existing skips, exit 0; new OPT-820 scenarios cover fourteen tests. Required full `pnpm run verify` and final SHA evidence are recorded in the PR body.

No schema/wire changes, migrations, client animation changes or spectator changes. OPT-818/819 prerequisites are merged. No remaining scoped successor; OPT-821's independent field-to-Life choice continuation must survive final main integration. No production repair or manual deployment is required.

## Blocked after final independent review

The required local gate passes at code head `3000fb5a485de6d3eac05c7cbe875c9a093f454e`, but this PR is **not merge-ready**. Final independent review confirmed the same chronology defect in a naturally reachable **non-optional** replacement: outer DRAW → K.O. attempt → replacement PLAY_CARD → On Play hand cost / DRAW → outer suffix DRAW. The substitute's CARD_PLAYED reaches the log before the earlier outer CARD_DRAWN. The optional replacement variant passes; the non-optional variant retains the prefix only in the outer caller while the nested drain runs, then stores it on an interrupted frame too late.

Evidence: `/private/tmp/opt820-independent-feedback.log`, reviewer scratch `review820-feedback.test.ts`, and advisory thread `PRRT_kwDORn6rD86g6Bgh` on PR #651. This is a material unresolved acceptance failure, not deferred cleanup. The bounded review/delta cycle is exhausted; the coordinator halted implementation and merging for approach reassessment. The PR is draft.

Next approach to assess: propagate caller-held committed prefixes before entering a nested drain, with one explicit event owner across caller, frame and publication boundaries. No implementation of that broader approach has been made. Preserve existing regression evidence and prove the non-optional whole-chain case before renewing review and readiness. Local full verification at the unchanged code head passed (app 2,367, pipeline 48, worker 2,396 / five existing skips, real disposable PostgreSQL, exit 0); passing suites do not close this independently reproduced gap.
