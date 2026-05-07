# Claude Code workflow — worked example: OPT-366

A worked example of the workflow I use with Claude Code to take a Linear ticket from "I'm starting it" to "PR is open, Linear is in review, handoff doc is committed." OPT-366 (the pre-game flow ticket — see [PR #222](https://github.com/corycunanan/optcg-sim/pull/222)) is a 5-point ticket that touched the engine, the worker, the shared types, the client, the event log, and the test suite — a reasonable cross-section of what tickets look like in this repo.

This doc is for contributors who want to understand the agent loop I run, what skills/MCP tools the agent uses, what context it loads, where decisions get made, and how it ships.

---

## Entry point

One command kicked the whole thing off: **`/ticket opt366`** — a project-local skill defined at `.claude/skills/ticket/`. The skill is an end-to-end recipe (preflight → branch → audit → implement → ship → handoff). Everything below is what the skill drove.

---

## Phase 1 — Preflight (parallel checks)

Before touching a file, the skill ran in parallel:

- `git status --porcelain` — working tree clean
- `gh pr list --author @me --state open` — no open PRs by me
- `git fetch origin main` + SHA compare — local main current vs `origin/main` (it wasn't; fast-forwarded)
- `gh pr list --state merged --limit 1` + `git merge-base --is-ancestor` — last merge reachable
- `gh auth status` — gh authenticated

Two pre-existing untracked files (`.agents/skills/ticket-review/`, `.env.prod-temp`) were noted and left alone.

---

## Phase 2 — Fetch ticket + load handoff context

In one parallel batch:

- `mcp__linear-server__get_issue OPT-366` — full description + acceptance + relations
- `mcp__linear-server__list_issue_statuses OPTCG Sim` — status names resolved at runtime, not hardcoded
- `mcp__linear-server__list_issues --project "Pre-Game Flow"` — all sibling tickets for the Action Plan
- Read `docs/project/handoffs/_TEMPLATE.md` + `ls docs/project/handoffs/` — no existing `pre-game-flow.md`, so I created one from the template at the end

---

## Phase 3 — Branch + Linear → In Progress

- Branch: `corymcunanan/opt-366-pre-game-flow-priority-decision-2d6-hand-redraw-mulligan` (slug from Linear title verbatim, repo convention)
- `mcp__linear-server__save_issue` → state: "In Progress", assignee: "me"

---

## Phase 4 — Code audit (read before write)

The ticket called out specific files; I read them all in two parallel batches and pulled the contracts I'd need:

- `workers/game/src/engine/setup.ts` — the existing one-shot `buildInitialState`
- `workers/game/src/GameSession.ts` — `handleInit` + `resumeFromPrompt` + `StoredSession` shape
- `shared/game-types.ts` — `GameState`, `TurnState`, `PromptOptions` union, `GameEventPayloadMap`
- `workers/game/src/engine/phases.ts` — found the §6-3-1 / §6-4-1 hardcoded `pi === 0` and the round-counter increment bug **not** explicitly listed in the ticket but implied by acceptance
- `workers/game/src/engine/pipeline.ts` + `execute.ts` + `events.ts` — to learn how CONCEDE flows and how to emit events
- `src/components/game/live-game-shell.tsx` + `board-modals.tsx` + `player-choice-modal.tsx` + `deck-preview-modal.tsx` — client patterns to follow (image rendering via `cardDb[id].imageUrl`, modal mounting as ScaledBoard sibling, `motion/react` for animation)
- `workers/game/src/__tests__/factories.ts` + `helpers.ts` — test conventions (`createTestPayload`, `setupGame`, `CARDS` fixture)

---

## Phase 5 — Implementation, tracked via TaskCreate / TaskUpdate

The harness's task tracker held 10 tasks (preflight → audit → A/B/C/D/E/F phases per the ticket → ship). I marked them in-progress / completed as I went so the user could see live progress in the UI. Order:

1. **Phase A — split `setup.ts`** into `prepareDecksAndLeaders` / `dealOpeningHand` / `placeLifeCards`. Kept `buildInitialState` as a one-shot wrapper to avoid touching 924 existing engine tests + sandbox fixtures.
2. **Phase B — `engine/pregame.ts` FSM**. Single-step state machine: each call either runs a server-side step or surfaces a prompt and pauses.
3. **Phase C — wire `GameSession`** (`handleInit` enters FSM via `startPregame` + `drainPregame`; `resumeFromPrompt` recognizes `PREGAME_PRIORITY_CHOICE` / `PREGAME_MULLIGAN` resume contexts).
4. **Type-check #1** — caught two sandbox `GameState` literals missing `pregame: null`. Fixed.
5. **Phase D — client overlay** at `src/components/game/pregame/` (4 components). Wired into `live-game-shell.tsx` as a sibling of `<ScaledBoard>`. Filtered the generic `PlayerChoiceModal` in `board-modals.tsx` so it doesn't double-render with the overlay.
6. **Phase E — event log**. Added 3 event types (`PREGAME_PRIORITY_ROLLED`, `PREGAME_FIRST_PLAYER_DECIDED`, `MULLIGAN_DECISION`) to `GameEventPayloadMap`; rendered them in `EventLog`.
7. **Phase F — tests** (`opt-366-pregame-flow.test.ts`, 17 cases). First run: 2 failures.

---

## Test-driven discovery

The CONCEDE-during-pregame test failed with `result.gameOver` undefined even though `result.state.status === "FINISHED"`. Root cause: the pipeline early-returns on `nextState.pendingPrompt` after step 4 (Execute), before `finishPipeline` builds `gameOver`. With pregame, the `pendingPrompt` was still set when CONCEDE ran.

**Fix:** `executeConcede` now clears `pendingPrompt` (`workers/game/src/engine/execute.ts`). Localized fix instead of restructuring the pipeline. The test now anchors a regression guard for any future change here.

This is the value of writing tests in the same session as the implementation — a fix that took 30 seconds would have taken hours to track down once the FSM was being exercised through the real WebSocket path in production.

---

## Decisions worth flagging (where I diverged from the spec)

- **`firstPlayerIndex` optional, not required**, with `?? 0` defaults at every read site. Required would have meant editing ~30 test files. Optional preserves pre-OPT-366 behavior (player 0 always first) for any code path that bypasses the FSM.
- **Reused `PLAYER_CHOICE` prompt with semantic `effectDescription` tags** (`"PREGAME_FIRST_OR_SECOND"` / `"PREGAME_MULLIGAN"`) instead of adding new `PromptType` variants. Less surface area; the spec recommended evaluating this trade-off and lean toward reuse.
- **`pregame` lives on the shared `GameState`**, not as a DO-only `StoredSession` field. Reason: clients re-render on every `game:state` broadcast — putting `pregame` on `GameState` means clients see pregame transitions for free without a new server message type.
- **Skipped the dedicated `game:pregame_priority_rolled` ServerMessage** the ticket suggested. The same effect comes from `pregame.priorityRolls` flipping non-null in a `game:state` broadcast — clients diff the value and animate. Documented as deferred in the handoff doc; can revisit if real testing shows the diff-driven animation feels janky.

---

## Phase 6 — Type-check, lint, test, ship

```
npm run type-check       # clean
npm run lint             # 0 new errors, 1 new warning (<img> in mulligan-modal,
                         # consistent with existing deck-preview-modal pattern)
npx vitest run           # 924 worker tests pass (17 new)
npm test                 # 501 app tests pass
```

Two atomic commits:

1. Implementation (engine + worker + client + tests)
2. Handoff doc

`git push -u origin <branch>` → `gh pr create` with HEREDOC body. Linear → "In Review" via `mcp__linear-server__save_issue`. The PR was auto-attached to the Linear issue by Linear's GitHub integration (matching on the branch name).

---

## Phase 7 — Handoff doc

`docs/project/handoffs/pre-game-flow.md` (new). Includes:

- Action Plan table for OPT-366/365/367/368 ordered by deps
- Inbound handoff for OPT-365 with:
  - **Primer** — what changed at the system level
  - **Files to read first**
  - **Gotchas / do NOT touch** (`firstPlayerIndex` optionality, `executeConcede` pendingPrompt clear, `effectDescription="PREGAME_*"` tag filter, legacy `mulliganDone` field)
  - **Unresolved** — deferred dedicated server message
  - **Why this matters for OPT-365** — the `START_OF_GAME_FX` seam the FSM exposes

The next agent picking up OPT-365 reads this doc + the ticket and is productive without re-deriving last session's findings from `git log`.

---

## Skills not used (and why)

The repo exposes ~50 skills (`frontend-design`, `polish`, `audit`, `animate`, `simplify`, …). I didn't invoke any — this ticket was engine + state-machine work, not a design pass or framework task. The `/ticket` skill itself was the only one that fit. The Linear MCP server and `gh` CLI did the heavy lifting outside that.

Worth noting which skills *would* have fit other ticket shapes:

- A pure UI ticket → `frontend-design`, `polish`, `arrange`, `colorize`, `delight`
- A bug investigation → `investigate` (drives an end-to-end RCA + breaks down a Linear project)
- A design-system normalization pass → `normalize`, `extract`
- A Vercel deployment / env / CI/CD ticket → `vercel:deployments-cicd`, `vercel:env-vars`
- A second-pass review → `simplify`, `security-review`, `review`

For an engine-internal FSM ticket, the right move was to skip them.

---

## Tools used (rough breakdown)

| Tool | Purpose |
|---|---|
| `Bash` | git, gh, npm scripts, file listing |
| `Read` / `Edit` / `Write` | file ops |
| `TaskCreate` / `TaskUpdate` | progress tracking visible to user |
| `mcp__linear-server__get_issue` / `list_issue_statuses` / `list_issues` / `save_issue` | ticket fetch + status transitions |
| `gh pr create` / `gh pr list` | branch ship + history |
| `ToolSearch` | load deferred tool schemas (TaskCreate, Linear MCP) on demand |

---

## TL;DR if you're trying this on your own ticket

1. Author a `/ticket` skill (or use mine — `.claude/skills/ticket/`).
2. Make sure `gh` is authed and the Linear MCP server is connected (`/mcp` to check).
3. Run `/ticket OPT-XXX`. The skill will surface anything that fails preflight before touching code.
4. Read the agent's task list in the UI. The phase breakdown is the contract — if it's wrong, redirect early.
5. Don't expect the agent to "guess scope" on ambiguous tickets. The `/ticket` skill explicitly says: *if the ticket is ambiguous, ask rather than pick — auto mode is not a license to guess*. If it asks, answer; if it doesn't ask but should have, that's a tighter ticket spec for next time.
6. Read the handoff doc the agent writes at the end. It's the input the next session needs to be productive.
