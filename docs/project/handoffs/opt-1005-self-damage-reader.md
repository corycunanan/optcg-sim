# OPT-1005 semantic reader prerequisite

Base: `4858458abb4516c3085543f84c5b20e2364c8ec6`. This prerequisite widens one semantic reference check before the original OPT-993/OPT-996 producer PR. No frame field, kind, version, writer or runtime producer changes.

The effect-damage frame already represents equal `controllerIndex` and `damagedPlayerIndex`. Its reader nevertheless rejected a parent chain paused on SELF_TAKE_DAMAGE. Candidate writer `dd3b17f5539ffa7449a18f11ed9a8113d7378d80` demonstrates that rejection through authored OP14-115 On K.O., decline optional Life add, and self-damage REVEAL_TRIGGER. The reader now accepts either DEAL_DAMAGE or SELF_TAKE_DAMAGE; direct adjacency, referenced id and TRIGGER_DRAIN kind checks remain.

## Evidence

All fixtures are **synthetic**, not production captures. Production capture access was unavailable to the coordinator (wrangler authentication failed); the production capture gate remains open unless the user explicitly grants a scoped exception. No merge or deployment is authorized by this handoff.

Two fixtures contain actual candidate pipeline output serialized after SessionRepository.save, which allocates the pending prompt id. The first uses authored OP14-115 plus authored OP14-116 Trigger; the second uses authored Rindo plus a synthetic optional draw Trigger to exercise the later TRIGGER_EFFECT pause. Candidate source and capture provenance are pinned in fixture metadata; capture script and logs are retained outside the repository under `../work/opt1005/`. Fixtures are inputs to this reader branch; its unchanged producer cannot create self-damage windows.

The reader tests load both live and restored undo states through SessionRepository.save/load, accept and decline the reveal, and compare complete accepted output (events, players, allocator ids, clocks and cleanup) against candidate output. A later child-prompt reload resumes to byte-equivalent completed output. Negative tests retain unrelated actions, orphan id, nonadjacent real parent and wrong-kind rejection. Existing DEAL_DAMAGE is accepted. A constructed version-3 ingress also accepts the same self action; native v6 candidate supplies real session ingress proof.

Supported ingress inventory: persistence.convertPersistedGameState routes native versions 4, 5, 6 and 7 through native validation then validateContinuationReferences; historical 1–3 conversion validates references before and after lifting. Native version5/6/7 call isValidNativeVersion5 -> isValidNativeVersion4, which also applies the shared validator. version4 lowerer separately rejects a parent reference to a removed non-executable boundary. Versions 1/2 legacy pending records have no SELF parent reference and retain their unchanged lifts. No second persisted parent-action allowlist exists (`rg DEAL_DAMAGE` across session reader sources).

Focused tests: exact explicit collection followed by run from workers/game, covering opt-1005-self-damage-reader, opt-963-v3-reader, opt-940-writer-golden, opt-968-current-writer. Initial new live/undo reload tests failed on the original reader's DEAL_DAMAGE-only contract. Final focused result: 154 tests pass in 4 files; worker TypeScript check passes. Golden fixtures and writer code remain unchanged. Three mutation checks restore the old guard, remove action checking, or remove adjacency checking; each must fail before restored final validation. Logs: `../work/opt1005/reader-{red,final}-*.log`, `reader-mutation-*.log`, `reader-types.log`.

## Rollout and follow-ups

Reader must pass independent review, exact-head required CI and deployment verification before the self-damage producer can land. Original writer remains frozen on its separate branch; no merge performed. After reader deployment, merge main into producer branch, run OP14-115 accept/decline/reload, cannot-add destination negative, OPT-996 full prefix order and existing OPT-960/963/926/925/984 regressions, and complete the Large-tier full gate. The original PR title and two-issue scope remain unchanged.

Historical review path `docs/project/handoffs/runs/reviews/2026-10-17-opt963-pr758-opus.md` was absent at this base; the full ticket reproduced D-F2b and coordinator obtained PR758 body.
