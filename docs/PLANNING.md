# Project Planning & Risk Assessment

> Unknowns, timeline estimates, and prioritization for the OPTCG Simulator project.

---

## Timeline Estimate

| Phase | Estimate | Cumulative |
|-------|----------|------------|
| M0 — Foundation | 7–9 days | ~1–2 weeks |
| M1 — Deck Builder | 9–12 days | ~3–4 weeks |
| M2 — Social | 10–13 days | ~5–7 weeks |
| M3 — Simulator Core | 20–26 days | ~9–12 weeks |
| M4 — Effect Engine | 28–40 days | ~15–20 weeks |
| M5 — Polish & Scale | 26–38 days | ~20–28 weeks |

**Total: roughly 5–7 months of focused work.**

Assumes one developer (agent-assisted) working serially. Parallel work on independent pieces (e.g. data pipeline while building UI) can compress the timeline, but the critical path runs through M3 → M4 which is sequential and heavy.

M0–M2 is the straightforward part. M3–M4 is where the real time goes.

---

## Highest Impact Unknowns

### 1. The Effect System is the Project

**Risk: High. Impact: High.**

M4 accounts for roughly 30–40% of total effort. The effect schema needs to represent every card ever printed — and new sets keep coming. The gap between "schema handles 80% of cards cleanly" and "schema handles 100%" is where the pain lives. OPTCG card text is natural language with edge cases, conditional chains, and interactions the designers probably didn't fully anticipate.

Key unknowns:
- Can one schema vocabulary cover all existing card mechanics?
- How many cards have effects that break the schema and require vocabulary extensions?
- How well does LLM parsing actually perform on OPTCG text? The "80% auto-accept" target in M5 is a guess.

**Mitigation:** Start hand-authoring schemas early — even during M0/M1 — to stress-test the vocabulary against real cards before the engine is built around it.

### 2. Effect Interactions and Rule Processing Timing

**Risk: High. Impact: High.**

The comprehensive rules have a precise ordering for when effects activate, who resolves first, when replacement effects intercept, and when rule processing interrupts. Getting this *almost* right produces a simulator that *almost* works — which is worse than not having one, because players will learn wrong interactions.

Specific timing complexities:
- §8-6's effect resolution ordering (turn player first, then if a new trigger fires, non-turn player resolves their pending effect before the new one)
- Replacement effects (§8-1-3-4) are interceptors that can chain but can't loop
- [On K.O.]'s two-phase activation/resolution (§10-2-17) is unlike any other effect

**Mitigation:** Build a comprehensive test suite of known card interactions before implementing. OPTCG community rulings and FAQs document edge cases — those become test cases.

### 3. Card Data Sourcing — ✅ LARGELY RESOLVED

**Risk: Low (was Medium). Impact: High (blocks everything).**

**Resolution:** Identified two community tools:
- **vegapull** (https://github.com/coko7/vegapull) — Rust CLI that scrapes the official OPTCG site. If it works against the current site, gives us full coverage (all sets including OP-14).
- **punk-records** (https://github.com/buhbbl/punk-records) — prefetched JSON dataset from vegapull. 4,007 cards across 50 packs as of March 8, 2026. Coverage through OP-09 only.

**Pipeline strategy:** Try vegapull directly first (Mode A) for full coverage. Fall back to punk-records (Mode B) if vegapull hits issues. Import pipeline includes an art variant grouping step to deduplicate cards that appear across multiple packs.

**Remaining gaps:** ban status, block rotation, errata (maintained manually). Art variants handled via dedup/grouping in the import pipeline.

See [DATA-PIPELINE.md](./DATA-PIPELINE.md) for full evaluation, field mapping, and pipeline design.

### 4. Game Server Architecture and Hosting

**Risk: Medium. Impact: Medium.**

The game server needs persistent WebSocket connections and in-memory game state (can't run on Vercel). Unknowns:
- How does the API server (Vercel) communicate with the game server (Railway)?
- What happens when the game server restarts? All in-memory state is lost.
- At what scale does a single instance become a bottleneck?

**Mitigation:** For MVP, keep it simple — single game server instance, games lost on restart. Design GameState to be serializable from day one so persistence (Redis, Postgres) can be added later without restructuring.

### 5. Competitive Rules Accuracy

**Risk: Medium. Impact: High for target audience.**

OPTCG simulator users are competitive players. They'll notice if counter step timing is wrong or if DON!! power works on the opponent's turn when it shouldn't. The game engine requirements doc caught 13 errors in the original M3 design — and that was from one careful reading. More edge cases likely hide in specific card interactions.

**Mitigation:** Get a rules-knowledgeable player to review the engine requirements doc and playtest early builds. Community rulings and judge calls reveal the gaps.

### 6. Scope Creep from Manual to Automated Effects

**Risk: Medium. Impact: Medium.**

M3 ships with manual effect tracking. M4 automates them. The transition is awkward: a UI built around "click to announce what you're doing" must be replaced with "the engine does it for you." The M3 UI and M4 engine patterns may not compose cleanly.

**Mitigation:** Design M3's UI with automation in mind from the start. The "manual effect" button should be a placeholder for where the effect engine slots in — not a fundamentally different interaction model.

---

## Prioritization: What to Investigate First

Before writing code:

1. ~~**Card data source**~~ — ✅ Resolved. Using punk-records community JSON dataset.
2. **Effect schema stress test** — pick 20 of the most complex cards across 2 sets and try to author their effectSchema by hand. See where the vocabulary breaks.
3. **Community rulings** — find OPTCG judge rulings or FAQ documents that cover edge cases not in the comprehensive rules. These become the test suite.

---

_Last updated: 2026-03-15_
