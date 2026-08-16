---
name: explore
description: Fan out Codex explorer subagents (Terra/Luna, low effort) to map an unknown bug before diagnosing it — Fable orchestrates and synthesizes falsifiable hypotheses; engine bugs always get a rules-docs explorer. Use when a bug's cause is unknown or spans layers, or the user says explore/recon/map this bug. Args - a bug description or a Linear issue ID.
---

# Explore — Codex swarm bug exploration

Fable orchestrates; Codex subagents explore. The division of labor is strict: **explorers report facts, Fable forms hypotheses**. An explorer that proposes a root cause has overstepped — early verdicts anchor the synthesis and defeat the point of independent legs.

Runtime: raw `codex exec` with `--sandbox read-only`, dispatched as parallel background shell tasks **from the repo root** — read-only explorers need no clones. Bypass the `codex:codex-rescue` forwarder; dispatch directly.

## 1. Scope

Parse the arg (free-text bug description, or `OPT-NNN` → `get_issue` for full ticket text). Anchor the symptom yourself with at most one or two greps (error string, entry point) — enough to cut domains, no more. Deeper solo reading is the explorers' job.

## 2. Cut domains — data-flow legs, not directories

Slice the suspect data path into **legs**: contiguous stretches of the flow small enough for one low-effort pass to read exhaustively. Cross-layer bugs die at domain boundaries, so legs follow the data, and every leg must report what crosses its edges (see the report contract below).

Sizing: **4–7 legs** for a typical bug. Below 4 you've made each leg too big to read exhaustively at low effort; above 7 you're paying dispatch overhead for legs with nothing to find. Add legs only when the symptom genuinely touches more layers.

Standing legs for **game engine bugs** (pick the relevant ones; **rules is mandatory** for any engine bug):

| Leg | Surface | Model |
|---|---|---|
| rules | `docs/rules/` (Comprehensive Rules) + `docs/cards/<set>` canonical effect text — establish what SHOULD happen, independent of code | Luna |
| client-render | game board components, overlays, modals, z-layers (`src/components/game/`) | Terra |
| client-wire | hooks, WebSocket message handling, prompt/state wiring (`src/hooks/`) | Terra |
| api | start/token/lobby routes on the suspect path (`src/app/api/`) | Terra |
| worker-session | DO session layer: auth, filtered/broadcast state, prompt lifecycle (`workers/game/src/session/`, `GameSession.ts`) | Terra |
| worker-engine | pipeline, pregame FSM, effect resolver, triggers (`workers/game/src/engine/`) | Luna |
| schemas | authored card schemas for the implicated cards (`workers/game/src/engine/schemas/`) | Luna |
| tests | existing coverage touching the symptom — what's asserted, what's absent (`__tests__`, colocated `*.test.ts*`) | Terra |

Non-engine bugs: cut legs the same way along whatever path the symptom implicates (page → component → hook → API → DB).

## 3. Dispatch explorers

Model routing: **Terra** for search-shaped legs (inventory, trace, enumerate — find-not-judge), **Luna** for interpretive legs (rules text, spec-vs-code comparison, FSM semantics). Both at low effort:

```bash
codex exec -m gpt-5.6-terra --sandbox read-only -c model_reasoning_effort="low" - <<'EOF'
<explorer prompt>
EOF
```

Dispatch all legs in parallel as background tasks. Gotchas: 5.6 models reject `minimal` effort (valid: none/low/medium/high/xhigh); parallel read-only runs on one repo dir are safe.

Every explorer prompt embeds: the verbatim symptom/ticket text, its leg's surface (paths), the sibling legs by name (so it stays inside its fence), and this **report contract**:

> Return exactly four sections, quoting `file:line` for every claim:
> - **FACTS** — what the code in your leg actually does on the suspect path.
> - **BOUNDARY** — what enters and leaves your leg: messages, props, state shapes, invariants you rely on neighbors to uphold, and invariants you uphold for them.
> - **ANOMALIES** — anything suspicious, asymmetric, or surprising. Flag it; do not diagnose it.
> - **UNKNOWNS** — what you could not determine from your leg alone.
> Report facts only — no root-cause proposals, no fixes. Do not modify files. You have no network or Linear access; missing external access is not grounds to stop.

The rules explorer's contract differs in one line: its FACTS are the official ruling for the scenario (rule numbers, card text), so synthesis can compare SHOULD against DOES.

## 4. Synthesize — Fable only

Read every report. The payoff of small legs is the **joins**: line up each leg's BOUNDARY against its neighbors' and hunt mismatches — a message sent that no one handles, an invariant assumed that no leg upholds, rules-SHOULD diverging from engine-DOES. Verify any load-bearing joined claim against the code yourself before ranking it; explorer reports are evidence, not ground truth.

Produce **3–5 ranked falsifiable hypotheses**. Each states its prediction: "If X is the cause, then Y will make the bug disappear / Z will reproduce it." A hypothesis with no prediction is a vibe — sharpen it or drop it. Show the ranked list to the user (they often re-rank instantly from domain knowledge), but proceed with your ranking if they're AFK.

Done when the top hypothesis has a full evidence chain (who waits for what, who never sends it — every link `file:line`) and each rival is either explained away or explicitly still open.

## 5. Red repro — default for engine bugs

A hypothesis is confirmed when a test goes **red** on it: fails on the current head for the user's exact symptom, and will go green when fixed. The worker vitest harness (`workers/game/src/__tests__/` — drain/pipeline/filtered-state patterns) is the usual seam; component tests for client-side causes.

Dispatch ONE write-capable Codex (`gpt-5.6-sol`, default effort) in a **fresh clone** (`git clone <local-repo> /private/tmp/optcg-explore-<slug>`; clones-not-worktrees is the Codex sandbox rule) to author the repro test for the top hypothesis and run it. Deliverable: the test as a patch in its final message plus the failing output — no commit, no push. If it can't make the test fail, that refutes the hypothesis: return to step 4 and promote the next one.

Skip only when the top hypothesis has no test seam (pure visual layering, environment-only) — say so explicitly in the report.

## 6. Deliver

Final report to the user: root cause (or top candidates) with the evidence chain, the red repro patch if built, refuted hypotheses one line each, and surviving UNKNOWNS. Then offer the handoff: file a Linear ticket embedding the evidence chain and repro, and run `/orchestrate OPT-NNN` for the fix. Exploration ends at diagnosis — this skill never fixes.
