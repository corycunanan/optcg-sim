# OPTCG Simulator — Documentation Index

> Living documentation for the One Piece Trading Card Game Simulator project.

---

## Architecture & Infrastructure

- [Architecture Overview](./architecture/ARCHITECTURE.md) — system diagram, service boundaries, data flow, deployment topology
- [Deployment](./architecture/DEPLOYMENT.md) — service map, Vercel + Cloudflare split, lobby→game handoff
- [Tech Stack](./architecture/TECH-STACK.md) — all technologies, versions, and rationale for each choice
- [Data Pipeline](./architecture/DATA-PIPELINE.md) — vegapull/punk-records evaluation, field mapping, art variant grouping, pipeline design

## Milestones

Each milestone doc covers scope, implementation plan, roadmap, architecture specifics, and acceptance criteria.

| Phase | Title | Doc |
|-------|-------|-----|
| M0 | Foundation | [M0-FOUNDATION.md](./milestones/M0-FOUNDATION.md) |
| M1 | Deck Builder | [M1-DECK-BUILDER.md](./milestones/M1-DECK-BUILDER.md) |
| M2 | Social | [M2-SOCIAL.md](./milestones/M2-SOCIAL.md) |
| M2.5 | Design System | [M2.5-DESIGN-SYSTEM.md](./milestones/M2.5-DESIGN-SYSTEM.md) |
| M3 | Simulator (Core) | [M3-SIMULATOR-CORE.md](./milestones/M3-SIMULATOR-CORE.md) |
| M3.5 | Simulator Tech Debt | [M3.5-SIMULATOR-TECH-DEBT.md](./milestones/M3.5-SIMULATOR-TECH-DEBT.md) |
| M3.75 | Game Board UI Tech Debt | [M3.75-GAME-BOARD-UI-TECH-DEBT.md](./milestones/M3.75-GAME-BOARD-UI-TECH-DEBT.md) |
| M4 | Effect Engine | [M4-EFFECT-ENGINE.md](./milestones/M4-EFFECT-ENGINE.md) |
| M4.5 | Schema QA | [M4.5-SCHEMA-QA.md](./milestones/M4.5-SCHEMA-QA.md) |
| M4.5 P4 | Integration Testing | [M4.5-PHASE4-INTEGRATION-TESTING.md](./milestones/M4.5-PHASE4-INTEGRATION-TESTING.md) |
| M5 | Polish & Scale | [M5-POLISH-AND-SCALE.md](./milestones/M5-POLISH-AND-SCALE.md) |
| M5.1 | UI Foundation | [M5.1-FOUNDATION.md](./milestones/M5.1-FOUNDATION.md) |
| M5.2 | Component Library | [M5.2-COMPONENT-LIBRARY.md](./milestones/M5.2-COMPONENT-LIBRARY.md) |
| M5.3 | Game Board | [M5.3-GAME-BOARD.md](./milestones/M5.3-GAME-BOARD.md) |
| M5.4 | Game Board Motion | [M5.4-GAME-BOARD-MOTION.md](./milestones/M5.4-GAME-BOARD-MOTION.md) |
| M5.5 | Art Variants | [M5.5-ART-VARIANTS.md](./milestones/M5.5-ART-VARIANTS.md) |
| M6 | Scale & Features | [M6-SCALE-AND-FEATURES.md](./milestones/M6-SCALE-AND-FEATURES.md) |
| M7 | Effect Showcase | [M7-EFFECT-SHOWCASE.md](./milestones/M7-EFFECT-SHOWCASE.md) |

## Game Engine

- [Game Engine Index](./game-engine/README.md) — full index for the effect schema spec (11 spec files, ~12,000 lines)
- [Rules → Engine Map](./game-engine/RULES-TO-ENGINE-MAP.md) — every rule from Comprehensive Rules v1.2.0 mapped to engine functions, with gap analysis
- [Effect Schema Spec](./game-engine/01-SCHEMA-OVERVIEW.md) — start here: EffectBlock structure, categories, costs, chains, durations
- [Engine Architecture](./game-engine/08-ENGINE-ARCHITECTURE.md) — action pipeline, modifier layers, trigger system, event bus
- [Encoding Guide](./game-engine/11-ENCODING-GUIDE.md) — condensed pattern-matching reference for card encoding
- [Game Engine Requirements](./game-engine/GAME-ENGINE-REQUIREMENTS.md) — rules-to-engine mapping from Comprehensive Rules v1.2.0
- [Card Analysis Findings](./game-engine/CARD-ANALYSIS-FINDINGS.md) — ~200 distinct card effect patterns across all 51 sets

## Design

- [Branding Guidelines](./design/BRANDING-GUIDELINES.md) — comprehensive design brief: tokens, typography, motion language, component patterns
- [Design Audit](./design/DESIGN-AUDIT.md) — interface quality audit across accessibility, performance, and theming
- [Design Critique](./design/DESIGN-CRITIQUE.md) — UX evaluation with actionable feedback
- [Game Board Layout Reference](./design/GAME-BOARD-LAYOUT-REFERENCE.md) — wireframe proportions, zone geometry, and responsive scaling rules
- [Interruption Modals](./design/INTERRUPTION-MODALS.md) — game board modal patterns for effects, triggers, and player choices

## Project Management

- [Planning & Risk Assessment](./project/PLANNING.md) — unknowns, timeline estimates, prioritization
- [Workflows & Tooling Guide](./project/WORKFLOWS.md) — GSD best practices, multi-agent usage, tool selection, documentation practices
- [Learnings](./project/LEARNINGS.md) — running log of decisions and discoveries

## Reference

- [PRD](./project/PRD.md) — product requirements document (source of truth)
- [Comprehensive Rules](./rules/rule_comprehensive.md) — official OPTCG rules v1.2.0
- [Rule Index](./rules/RULE-INDEX.md) — concept-to-rule lookup table (start here, then read specific rules)
- [Card Set Data](./cards/) — effect text for all 51 card sets (OP-01 through ST-29)

## Research

- [Git Practices](./research/GIT-PRACTICES.md) — git conventions for AI-assisted development at this project's scale
- [Rive Investigation](./research/RIVE-INVESTIGATION.md) — Rive vs React + Framer Motion evaluation for game board UI
- [Card Game UX Research](./research/CARD-GAME-UX-RESEARCH.md) — UX patterns from other digital card games
- [Semantic Schema Linter](./research/semantic-schema-linter.md) — automated card schema validation approach
- [First Play Session Notes](./research/First%20play%20session%20notes.md) — observations from initial playtesting

---

_Last updated: 2026-04-08_
