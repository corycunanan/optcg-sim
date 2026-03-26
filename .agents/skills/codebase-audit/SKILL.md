---
name: codebase-audit
description: Audit codebase architecture for modularity, reusability, and scalability issues. Analyzes dependency graphs, coupling, dead code, type safety, API consistency, and scalability bottlenecks. Generates prioritized report with actionable fixes.
user-invokable: true
args:
  - name: scope
    description: "all" for full codebase, or a specific area (e.g., "api", "components", "engine", "lib", "hooks", "types")
    required: false
  - name: focus
    description: Narrow to a specific audit dimension (e.g., "modularity", "reusability", "scalability", "types", "dependencies", "dead-code")
    required: false
---

# Codebase Architecture Audit

> Systematic audit of codebase health across modularity, reusability, and scalability. Documents issues — does not fix them.

## When to Use

- Before starting a new milestone or major feature
- After a large merge or refactor to verify nothing degraded
- When onboarding to an unfamiliar area of the codebase
- When performance, build time, or developer velocity is declining
- Periodic health checks (monthly or quarterly)

---

## Preparation

### 1. Load Project Context

Before auditing, read the project's configuration files to understand the intended architecture:

1. **`CLAUDE.md`** — Codebase map, directory conventions, import rules, design system constraints
2. **`.cursor/rules/`** — All `.mdc` rule files. These define the project's enforced standards. The audit checks compliance against these rules.
3. **`tsconfig.json`** / **`tsconfig.*.json`** — Path aliases, strict mode settings, compiler boundaries
4. **`package.json`** — Dependencies, scripts, workspaces
5. **`prisma/schema.prisma`** (if exists) — Data model, relations

### 2. Determine Scope

- **`scope: "all"`** (default) — Audit the entire `src/` tree plus `workers/` and `pipeline/` if they exist
- **`scope: "<area>"`** — Audit only the specified directory or domain (e.g., `scope: "api"` audits `src/app/api/`)
- **`focus: "<dimension>"`** — Run only the specified audit dimension (skip others)

### 3. Gather Baseline Metrics

Run these commands to establish a quantitative baseline before the qualitative audit:

```bash
# File count and line counts by directory
find src -name '*.ts' -o -name '*.tsx' | head -200
wc -l src/**/*.{ts,tsx} 2>/dev/null | tail -5

# TypeScript strict mode check
grep -c "strict" tsconfig.json

# Dependency count
jq '.dependencies | length' package.json
jq '.devDependencies | length' package.json
```

---

## Audit Dimensions

Run each applicable dimension. For each finding, record: location, severity, category, description, impact, and recommendation.

### Dimension 1: Modularity

Assess whether the codebase is properly decomposed into independent, well-bounded modules.

#### 1A. Circular Dependencies

Trace import chains to find cycles. A circular dependency means two modules depend on each other, making them impossible to reason about or test independently.

**How to check:**
- For each feature directory, trace its imports. If module A imports from module B and module B imports from module A (directly or transitively), that's a cycle.
- Common cycle patterns:
  - Types file imports from implementation → implementation imports from types
  - Component imports a hook → hook imports the component's types
  - Two feature directories importing from each other

**Severity:** High (direct cycles), Medium (transitive cycles through 3+ modules)

#### 1B. Dependency Direction

Verify that dependencies flow in the correct direction. The canonical layers are:

```
Pages/Routes → Components → Hooks → Lib/Utils → Types
                    ↓
               External APIs / DB
```

**Violations to flag:**
- `lib/` importing from `components/` (logic depends on UI)
- `types/` importing from `lib/` (types depend on implementation)
- `hooks/` importing from page-level components
- Shared utilities importing feature-specific code
- `workers/` importing from `src/` or vice versa (separate deployment targets)

**Severity:** High

#### 1C. Feature Isolation

Check that feature directories are self-contained and communicate through well-defined interfaces.

**How to check:**
- For each feature directory (e.g., `deck-builder/`, `admin/`, `social/`), list all imports from other feature directories
- Cross-feature imports should go through shared types, shared hooks, or shared lib — not reach into another feature's internal components
- Flag any component in `components/admin/` that imports from `components/deck-builder/` (or any cross-feature component import)

**Severity:** Medium

#### 1D. Component Decomposition

Check compliance with **C-1** (component structure rule):

- Files over 300 lines
- Files defining 3+ components without extraction into a directory
- Components mixing data fetching, business logic, and rendering in a single function

**Severity:** Medium (over 300 lines), Low (200-300 lines with mixed concerns)

#### 1E. Separation of Concerns

Flag files that mix multiple responsibility layers:

- API route handlers containing business logic (should delegate to lib/)
- Components containing data transformation logic (should be in hooks or lib/)
- Test files containing production utilities
- Config files containing runtime logic

**Severity:** Medium

---

### Dimension 2: Reusability

Assess whether the codebase avoids duplication and exposes well-designed shared abstractions.

#### 2A. Code Duplication

Identify duplicated logic that should be extracted into shared utilities.

**How to check:**
- Look for similar function signatures across files
- Search for repeated patterns: identical fetch wrappers, repeated validation logic, duplicated transformation pipelines, copy-pasted error handling blocks
- Check compliance with **S-1** (type deduplication) and **S-2** (hook extraction)

**What's NOT duplication:**
- Three similar lines are fine — don't flag premature abstraction opportunities
- Two components with similar JSX but different data are not duplicates
- Test setup code that's similar across test files is acceptable if each test needs slight variations

**Severity:** High (identical 10+ line blocks in 3+ files), Medium (similar patterns in 2 files), Low (minor repetition)

#### 2B. API Surface Design

Check whether shared modules expose clean, minimal APIs:

- Barrel exports (`index.ts`) that re-export everything vs. curated public APIs
- Functions with 5+ parameters that should use an options object
- Modules that export internal implementation details alongside public API
- Inconsistent naming: same concept called different things in different modules

**Severity:** Medium

#### 2C. Constants and Configuration

Check compliance with **S-3** (constants centralization):

- Magic numbers in component files (should be named constants)
- Same value defined independently in multiple files
- Configuration scattered across files instead of centralized

**Severity:** Low (single occurrence), Medium (repeated across files)

#### 2D. Shared Hook Health

For projects with custom hooks:

- Hooks that return 5+ values (doing too much, should be split)
- Hooks that are used by only one component (may not need to be a hook)
- Duplicate effect/state logic across components that should be a shared hook

**Severity:** Low

---

### Dimension 3: Scalability

Assess whether the codebase can handle growth in data, users, features, and team size.

#### 3A. Data Access Patterns

Check for patterns that degrade with scale:

- **N+1 queries:** Loops that make individual database calls instead of batch queries
- **Unbounded queries:** `findMany()` without `take`/`limit` — will return entire tables as data grows
- **Missing pagination:** List endpoints that return all results
- **Over-fetching:** Queries that `select` all columns when only a few are needed
- **Missing indexes:** Query patterns that filter/sort on unindexed columns (check against `schema.prisma`)

**Severity:** Critical (N+1 in hot paths), High (unbounded queries), Medium (over-fetching)

#### 3B. State Management

Check for state patterns that don't scale:

- Prop drilling deeper than 3 levels (should use context or composition)
- Global state holding data that should be local
- Derived state stored separately instead of computed on render
- Redundant state that duplicates server data without invalidation

**Severity:** Medium

#### 3C. Bundle and Import Hygiene

Check for patterns that bloat the client bundle:

- Server-only code imported in client components (database clients, auth secrets)
- Large libraries imported for a single utility function (e.g., all of lodash for `debounce`)
- Barrel imports pulling in entire feature trees (`import { oneUtil } from "@/lib"` loading everything)
- Missing dynamic imports for heavy components (modals, rich editors, charts)
- `"use client"` on components that don't need it (prevents server rendering)

**Severity:** High (server code in client), Medium (unnecessary bundle weight), Low (optimization opportunities)

#### 3D. Error Handling at Boundaries

Check that system boundaries validate input and handle failures:

- API routes: request body validation, authentication checks, proper error responses
- WebSocket messages: schema validation before processing
- External API calls: timeout handling, retry logic, fallback behavior
- Database operations: connection error handling, transaction boundaries
- File operations: existence checks, permission handling

**Severity:** High (missing auth checks), Medium (missing validation), Low (missing graceful degradation)

#### 3E. Concurrency and Race Conditions

Check for patterns vulnerable to concurrent access:

- Read-then-write sequences without transactions
- Optimistic updates without conflict resolution
- WebSocket handlers that assume sequential message delivery
- Shared mutable state across request handlers

**Severity:** High (data corruption risk), Medium (UX degradation)

---

### Dimension 4: Type Safety

Assess the strength of the type system as a correctness guardrail.

#### 4A. `any` and Type Assertions

Search for type safety escape hatches:

```
# Find all `any` usage
grep -rn ': any' src/ --include='*.ts' --include='*.tsx'
grep -rn 'as any' src/ --include='*.ts' --include='*.tsx'

# Find type assertions
grep -rn ' as [A-Z]' src/ --include='*.ts' --include='*.tsx'

# Find non-null assertions
grep -rn '!\.' src/ --include='*.ts' --include='*.tsx'
```

**Severity:** High (`any` in public APIs or shared types), Medium (`any` in implementation), Low (type assertions with clear justification)

#### 4B. Discriminated Unions

Check that polymorphic data uses discriminated unions instead of optional fields:

- Objects with many optional fields where only certain combinations are valid
- Switch statements on string types without exhaustive checking
- Action/event types that should be tagged unions

**Severity:** Medium

#### 4C. Zod/Schema Validation Alignment

If the project uses Zod or similar:

- Check that API request schemas match the TypeScript types they validate into
- Check that database query results are validated before use in client code
- Flag manual type assertions that bypass schema validation

**Severity:** Medium

#### 4D. Generic Constraints

Check for overly broad or missing generic constraints:

- `<T>` without `extends` when the function assumes structure on T
- `Record<string, any>` where a specific shape is known
- Utility types that could be narrower

**Severity:** Low

---

### Dimension 5: Dead Code and Hygiene

Identify code that serves no purpose and adds maintenance burden.

#### 5A. Unused Exports

Check for exported functions, types, and constants that are never imported:

- Exported functions with zero import references outside their own file
- Re-exported types that no consumer uses
- Constants exported "just in case"

**How to check:** For each export, grep for its name across the codebase. If it's only referenced in its own file, it's likely unused.

**Severity:** Low (unused exports), Medium (unused files)

#### 5B. Orphaned Files

Check for files that are not imported by anything:

- Components not rendered by any page or parent component
- Utility files not imported anywhere
- Test files for functions that no longer exist
- Migration files that have been superseded

**Severity:** Medium (orphaned implementation files), Low (orphaned tests/docs)

#### 5C. Commented-Out Code

Search for large blocks of commented-out code (5+ lines). Commented code is version-controlled by git — it shouldn't live in the source.

**Severity:** Low

#### 5D. TODO/FIXME/HACK Inventory

Catalog all TODO, FIXME, and HACK comments:

- How many exist?
- How old are they? (git blame)
- Are any in critical paths?
- Do any reference resolved issues?

**Severity:** Informational (inventory), Medium (stale TODOs in critical paths)

---

### Dimension 6: Consistency

Assess whether the codebase follows uniform patterns.

#### 6A. API Route Consistency

For projects with multiple API routes, check:

- Do all routes follow the same auth pattern?
- Do all routes return consistent response shapes (success/error envelopes)?
- Do all routes validate request bodies the same way?
- Are HTTP methods used correctly (GET for reads, POST for creates, etc.)?

**Severity:** Medium

#### 6B. Error Response Consistency

Check that error responses follow a uniform shape:

- Same HTTP status codes for same error types across routes
- Consistent error body format (`{ error: string }` vs `{ message: string }` vs mixed)
- Client-safe error messages (no stack traces, no internal details)

**Severity:** Medium (inconsistent), High (leaking internal details)

#### 6C. Naming Conventions

Check for inconsistent naming:

- Mixed casing: `getUserById` vs `get_user_by_id` vs `GetUserById`
- Same concept, different names: `userId` vs `user_id` vs `uid` across files
- File naming: `kebab-case.ts` vs `camelCase.ts` vs `PascalCase.ts`

**Severity:** Low

#### 6D. Project Rule Compliance

Check compliance against all `.cursor/rules/*.mdc` and `CLAUDE.md` rules:

- **C rules** — Component structure compliance
- **S rules** — Shared types and hooks compliance
- **E rules** — Engine immutability compliance (if applicable to scope)
- **T rules** — Test coverage compliance
- **G rules** — Git practices (check recent commits)
- **R rules** — Rules reference compliance (if applicable to scope)
- **CLAUDE.md styling rules** — No inline styles, no hardcoded colors, spacing scale, border-radius values, `cn()` usage

**Severity:** Varies per rule

---

## Output Format

### Report Structure

```markdown
# Codebase Audit Report

**Scope:** [all | specific area]
**Focus:** [all dimensions | specific dimension]
**Date:** [YYYY-MM-DD]
**Baseline:** [file count, line count, dependency count]

## Executive Summary

- **Total issues:** X (Y critical, Z high, W medium, V low)
- **Top 3 issues:** [brief descriptions]
- **Overall health:** [Healthy | Minor concerns | Needs attention | At risk]
- **Recommended immediate actions:** [1-3 bullet points]

## Findings by Severity

### Critical
[Issues that will cause bugs, data loss, or security vulnerabilities]

### High
[Issues that significantly impede development velocity or user experience]

### Medium
[Issues that accumulate into larger problems if left unaddressed]

### Low
[Cleanup opportunities and minor inconsistencies]

## Findings by Dimension

### Modularity — [score/5]
[Findings grouped under this dimension]

### Reusability — [score/5]
[Findings grouped under this dimension]

### Scalability — [score/5]
[Findings grouped under this dimension]

### Type Safety — [score/5]
[Findings grouped under this dimension]

### Dead Code — [score/5]
[Findings grouped under this dimension]

### Consistency — [score/5]
[Findings grouped under this dimension]

## Systemic Patterns

[Recurring issues that indicate process or architectural gaps]

## Positive Findings

[What's working well — patterns to preserve and replicate]

## Recommendations by Priority

### Immediate (this PR / session)
[Critical and high-severity items that can be fixed quickly]

### Short-term (this sprint)
[High and medium items that need focused work]

### Medium-term (next sprint)
[Architectural improvements]

### Long-term (roadmap)
[Strategic refactors, new patterns to adopt]
```

### Per-Issue Format

For each finding:

| Field | Description |
|-------|-------------|
| **ID** | `DIM-N` (e.g., `MOD-3`, `SCALE-1`) |
| **Location** | File path(s) and line number(s) |
| **Severity** | Critical / High / Medium / Low |
| **Dimension** | Modularity / Reusability / Scalability / Type Safety / Dead Code / Consistency |
| **Rule** | Which project rule it violates, if any (e.g., `C-1-1`, `S-2-1`, `E-2-2`) |
| **Description** | What the issue is — specific and factual |
| **Impact** | How it affects development, performance, or correctness |
| **Evidence** | Code snippet or grep output demonstrating the issue |
| **Recommendation** | How to fix it — specific and actionable |

---

## Audit Execution Workflow

1. **Load context** — Read CLAUDE.md, cursor rules, tsconfig, package.json, schema
2. **Gather baseline** — File counts, line counts, dependency counts
3. **Run dimensions** — Execute each applicable dimension's checks
4. **Cross-reference** — Look for systemic patterns across dimensions
5. **Score** — Rate each dimension 1-5 based on finding density and severity
6. **Draft report** — Assemble findings into the report structure
7. **Verify** — Spot-check 3-5 findings to confirm accuracy (re-read the file, confirm the issue exists)
8. **Present** — Output the report. Do NOT fix issues — document them.

---

## Scoping Guidelines

### Full Audit (`scope: "all"`)

Run all 6 dimensions across the entire codebase. For large codebases, prioritize:
1. Shared code (`lib/`, `types/`, `hooks/`) — highest leverage
2. API boundaries (`app/api/`) — highest risk
3. Core features by usage frequency
4. Supporting features

### Area Audit (`scope: "<area>"`)

Focus the audit on a specific directory or domain. Still run all dimensions, but scoped to that area's files and their immediate dependencies.

### Focused Audit (`focus: "<dimension>"`)

Run only the specified dimension across the full codebase. Use when investigating a specific concern (e.g., `focus: "dead-code"` after a large refactor).

---

## Common Pitfalls for Auditors

- **Don't flag premature abstractions as duplication** — Three similar lines are fine. Only flag duplication that actively causes maintenance problems.
- **Don't flag intentional trade-offs** — Some coupling is acceptable for simplicity. Some `any` is acceptable at FFI boundaries. Assess whether the trade-off is conscious.
- **Don't count issues without assessing impact** — 50 low-severity findings do not equal 1 critical finding. Severity matters more than count.
- **Verify before reporting** — Read the actual file. Grep results can be misleading (matches in comments, test files, etc.).
- **Respect existing conventions** — If the project consistently does X even though Y is "best practice," note it as a finding but respect that it may be intentional.
- **Acknowledge what's working** — A report that's all criticism is demoralizing and less useful than one that also highlights strengths to replicate.
