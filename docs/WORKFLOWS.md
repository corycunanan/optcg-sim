# Workflow & Tooling Guide

> How to use GSD, Claude Code, Gemini, and multi-agent workflows effectively for this project.

---

## GSD Workflow Best Practices

### What GSD Auto-Mode Handles Well (No Human Needed)

Tasks with **clear input → deterministic output → verifiable result**:

- Scaffold a project (Next.js + TypeScript + Prisma + Tailwind)
- Implement a REST API endpoint with known request/response shapes
- Build a React component from a clear spec
- Write and run database migrations from a defined schema
- Set up CI/CD pipelines
- Write unit/integration tests for existing code
- Debug a failing test or build error
- Refactor code with LSP-assisted precision
- Data pipeline scripts with clear input/output
- Reading large documents, cross-referencing, and producing structured output

### Where Human-in-the-Loop is Required

**Irreversible decisions:**
- Tech stack choices (Supabase vs Firebase, Socket.io vs raw ws)
- Product direction ("Should we support Block formats at launch?")
- Architecture pivots discovered mid-implementation

**Taste and UX judgment:**
- Game board interaction feel (card hover, animation timing, layout balance)
- Counter window UX clarity
- Mobile layout compromises
- The frontend-design skill helps with visual quality, but "does this feel like a good card game UI" needs human eyes

**Rules accuracy validation:**
- The game engine requirements doc should be reviewed by someone who plays competitively
- Community rulings and judge calls reveal gaps the comprehensive rules don't cover

**Ambiguous requirements:**
- When multiple reasonable interpretations exist and the wrong one wastes days
- GSD defaults to "smallest safe reversible action" but sometimes the right answer is to ask

### GSD Context Transfer Between Sessions

Each session starts with a blank context window. Context persists through artifacts:

**Automatic (committed to repo):**
- All `docs/*.md` files — architecture, phase docs, game engine requirements
- `LEARNINGS.md` — decisions log
- PRD — source of truth

**GSD-managed (when using structured `/gsd` workflow):**
- `STATE.md` — quick-glance status (current milestone, slice, what's done, what's next)
- Slice summaries (`S01-SUMMARY.md`) — compressed version of everything that happened
- Task summaries (`T01-SUMMARY.md`) — what was done, decided, and what to watch out for
- `DECISIONS.md` — append-only architectural choices

**Starting a new session:**
- Point it at the repo and say "Read the docs/ directory to get up to speed, then [next task]"
- Or run `/gsd` to enter structured workflow — it reads STATE.md and picks up automatically
- The docs ARE the context transfer mechanism

**What's lost between sessions:**
- Conversational nuance and back-and-forth discussion
- Implicit understanding of preferences not written down
- Mental model of priorities

If something matters for the next session, write it down in `LEARNINGS.md` or a project context file.

---

## Multi-Agent Usage

### When to Use Parallel Agents

Independent tasks with zero shared state:

| Parallel Pair | Why It Works |
|---------------|-------------|
| M0: Data pipeline (TypeScript) + Frontend scaffold (Next.js) | Completely independent codebases |
| M1: Card search API + Deck editor UI | API built to spec, UI built against mock data |
| M2: Friend system API + Messaging API | Independent feature domains |

### When NOT to Parallelize

- Tasks that share files or API shapes — creates merge conflicts
- M3 and M4 — deeply sequential (effect engine builds on game state machine)
- Coordination cost can exceed time saved if tasks aren't truly independent

### Scout → Planner → Worker Chains

For unfamiliar territory or large codebases:
1. **Scout** reads the codebase and gathers context
2. **Planner** designs the approach given that context
3. **Worker** implements the plan

Most useful from M3 onward when the codebase is large enough that a single context window can't hold everything.

---

## Tool Selection Guide

### GSD (Primary Tool)

**Best for:** Structured milestone-by-milestone implementation with verification.

Strengths:
- Structured workflow (milestones → slices → tasks) with state tracking
- Auto-mode for hands-off serial task execution
- Built-in verification ("work is done when the test passes")
- Subagent orchestration for parallel/chained work
- Living artifacts that persist context across sessions

Weaknesses:
- Overhead for quick one-off tasks
- Context window limits on very large files/codebases
- Auto-mode trusts the plan — a wrong plan gets executed efficiently

### Claude Code (Direct, No GSD Wrapper)

**Best for:** Quick investigations, one-off scripts, prototyping, ad-hoc tasks.

Strengths:
- Lower overhead — no milestone/slice structure
- Same underlying model and tools
- Good for exploration and quick fixes

Weaknesses:
- No persistent state tracking across sessions
- No auto-mode
- No built-in "definition of done" enforcement

### Gemini

**Best for:** Bulk analysis tasks that need massive context windows.

Strengths:
- 1M+ token context window — can ingest entire codebase, all docs, and all rules simultaneously
- Good at large-document cross-referencing

Weaknesses:
- No tool use (can't edit files, run commands, verify against live codebase)
- Outputs need manual application or piping through another tool
- Every query is stateless unless you manage context yourself

### Recommended Tool Assignment for This Project

| Activity | Tool | Why |
|----------|------|-----|
| Planning, discussion, docs | GSD or Claude Code | Interactive, iterative |
| M0–M2 implementation | GSD auto-mode | Structured serial tasks with verification |
| Data pipeline (TypeScript import) | GSD subagent (parallel) | Independent from frontend work |
| Game engine core (M3) | GSD, single-agent, frequent human review | High-stakes rules accuracy |
| Effect schema bulk authoring (M4) | Gemini for generation → GSD for integration/testing | Gemini's context window for analyzing 120+ cards at once |
| Card data source evaluation | Claude Code or GSD | Quick research task |
| UI polish and feel (M3 board, M5 mobile) | GSD with human in the loop | Taste-dependent work |
| Quick fixes, debugging, one-offs | Claude Code directly | Less overhead |

---

## Documentation Practices

### Why Documentation is Front-Loaded

Documentation serves dual purpose in this project:
1. **Human reference** — standard docs purpose
2. **Agent context transfer** — the docs are how future sessions understand the project

Every major decision, architecture choice, and rules interpretation should be written down because the next session has zero memory of this one.

### Document Types and When to Update

| Document | Type | Update Trigger |
|----------|------|---------------|
| `PRD` | Source of truth | When product scope changes |
| `docs/ARCHITECTURE.md` | Living | When service boundaries or deployment changes |
| `docs/TECH-STACK.md` | Living | When technology choices change |
| `docs/M0–M5-*.md` | Living | When phase plans change or more context is added |
| `docs/GAME-ENGINE-REQUIREMENTS.md` | Living | When rules interpretations are corrected or edge cases discovered |
| `docs/PLANNING.md` | Living | When risk assessment or timeline changes |
| `LEARNINGS.md` | Append-only | When a decision is made or a lesson is learned |
| `DECISIONS.md` (GSD) | Append-only | When an architectural choice is made during implementation |
| `STATE.md` (GSD) | Current state | After every slice/task completion |

### Writing Good Agent-Readable Docs

- Be specific and concrete — "use Prisma" not "use an ORM"
- Include the WHY — rationale helps future sessions make consistent follow-on decisions
- Call out corrections explicitly (like the 13 M3 corrections in GAME-ENGINE-REQUIREMENTS.md)
- Use machine-parseable formats where possible (tables, code blocks, enums)
- Keep files focused — one concern per file, not everything in one mega-doc

---

_Last updated: 2026-03-15_
