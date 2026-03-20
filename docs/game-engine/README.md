# Game Engine — Documentation Index

> Complete specification for the OPTCG card effect schema and game engine architecture. These documents define how every card effect in the game is represented as structured data and how the engine processes those effects into game state changes.

---

## How to Use This Spec

**Building the engine?** Read the spec files in order (01-08), then reference 10 for keyword details.

**Encoding a card?** Start with [11-ENCODING-GUIDE.md](./11-ENCODING-GUIDE.md) for quick pattern matching, consult [09-EXAMPLE-ENCODINGS.md](./09-EXAMPLE-ENCODINGS.md) for reference encodings, and use the [encode-card skill](../../.agents/skills/encode-card/SKILL.md) for agent-assisted encoding.

**Looking up a specific type?** Each spec file has a complete type index. Start with [01-SCHEMA-OVERVIEW.md](./01-SCHEMA-OVERVIEW.md) which links to all others.

---

## Effect Schema Specification

| # | File | Description | Lines |
|---|------|-------------|-------|
| 01 | [SCHEMA-OVERVIEW.md](./01-SCHEMA-OVERVIEW.md) | EffectBlock structure, 5 effect categories, cost system, chain semantics, durations, dynamic values | 584 |
| 02 | [TRIGGERS.md](./02-TRIGGERS.md) | ~30 trigger types: 12 keyword, ~18 custom events, compound triggers, turn restrictions | 1,083 |
| 03 | [CONDITIONS.md](./03-CONDITIONS.md) | ~35 condition types with compound logic, comparative, temporal, dynamic thresholds | 1,408 |
| 04 | [ACTIONS.md](./04-ACTIONS.md) | ~65 action primitives across 9 domains, each with inputs, outputs, failure modes, fired events | 2,598 |
| 05 | [TARGETING.md](./05-TARGETING.md) | Target types, 30+ filter fields, count modes, 16 advanced targeting patterns | 1,071 |
| 06 | [PROHIBITIONS-AND-REPLACEMENTS.md](./06-PROHIBITIONS-AND-REPLACEMENTS.md) | 11 prohibition types with scope qualifiers, 6 replacement triggers, proxy protection | 717 |
| 07 | [RULE-MODIFICATIONS.md](./07-RULE-MODIFICATIONS.md) | 11 rule modification types: name aliasing, deck restrictions, loss conditions, start-of-game | 708 |
| 08 | [ENGINE-ARCHITECTURE.md](./08-ENGINE-ARCHITECTURE.md) | Game state model, 7-step action pipeline, modifier layers, trigger system, event bus | 889 |

## Encoding Resources

| File | Description | Lines |
|------|-------------|-------|
| [09-EXAMPLE-ENCODINGS.md](./09-EXAMPLE-ENCODINGS.md) | 10 fully encoded cards spanning all schema features, with annotations | 661 |
| [10-KEYWORD-REFERENCE.md](./10-KEYWORD-REFERENCE.md) | Standard keywords, normalization rules, advanced keyword patterns, evolution notes | 668 |
| [11-ENCODING-GUIDE.md](./11-ENCODING-GUIDE.md) | Condensed pattern-matching reference for AI agents — text patterns to schema mappings | 427 |

## Reference Data

| File | Description | Lines |
|------|-------------|-------|
| [GAME-ENGINE-REQUIREMENTS.md](./GAME-ENGINE-REQUIREMENTS.md) | Complete rules-to-engine mapping from Comprehensive Rules v1.2.0 | 1,079 |
| [CARD-ANALYSIS-FINDINGS.md](./CARD-ANALYSIS-FINDINGS.md) | ~200 distinct card effect patterns identified across all 51 sets | 1,168 |
| [CARD-EFFECT-EXAMPLES.md](./CARD-EFFECT-EXAMPLES.md) | Complex card examples collected for schema validation | 250 |

## Agent Skill

| File | Description |
|------|-------------|
| [encode-card](../../.agents/skills/encode-card/SKILL.md) | Claude skill for single-card and batch card encoding using this spec |

---

## Spec Coverage

The schema was designed by analyzing every card with an effect across all 51 OPTCG sets (OP-01 through OP-15, ST-01 through ST-29, EB-01 through EB-04, PRB-01, PRB-02). The [CARD-ANALYSIS-FINDINGS.md](./CARD-ANALYSIS-FINDINGS.md) document catalogs the ~200 distinct patterns that informed the type system.

**Total spec size:** ~12,000 lines across 11 spec files.

---

_Last updated: 2026-03-19_
