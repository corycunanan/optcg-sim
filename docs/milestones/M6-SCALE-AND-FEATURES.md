# M6 — Scale & Features

> LLM-assisted effect parsing, full card database, spectator mode, game replay, and performance optimization.

> _Note: This was previously M5. Renumbered when M5 was restructured as the UI Overhaul milestone._

---

## Scope

M6 transitions the project from "functional simulator for 1–2 sets" to a scalable product covering the full OPTCG card pool. It introduces LLM-assisted effect parsing to scale effect authoring, adds spectator and replay features, and delivers performance optimization.

### Deliverables

- [ ] LLM-assisted effect text → effectSchema parser (Claude API)
- [ ] Full card database (all released OPTCG sets)
- [ ] Spectator mode (friends can watch ongoing games)
- [ ] Game replay / log viewer (post-game review)
- [ ] Performance optimization (card search, game rendering, image loading)

---

## Architecture (M6-Specific)

M6 doesn't introduce new services — it extends and scales existing ones.

```
┌────────────────────────────────────────────────────────────────┐
│  Enhancements to existing systems                              │
│                                                                │
│  Data Pipeline (extended)                                      │
│  ┌──────┐  ┌───────┐  ┌───────────┐  ┌───────────────────┐   │
│  │Fetch │─▶│ Parse │─▶│ Normalize │─▶│ LLM Effect Parser │   │
│  │(all  │  │       │  │           │  │ (Claude API)       │   │
│  │sets) │  └───────┘  └───────────┘  │                    │   │
│  └──────┘                            │ effectText → JSON  │   │
│                                      │ + confidence score │   │
│                                      │ + human review     │   │
│                                      └───────────────────┘   │
│                                                                │
│  Game Server (extended)                                        │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ + Spectator WebSocket connections                         │ │
│  │ + Full action log persistence for replay                  │ │
│  │ + Spectator room management                               │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  Client (extended)                                             │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ + Spectator view (read-only game board)                   │ │
│  │ + Replay viewer (step through game actions)               │ │
│  │ + Image optimization (WebP, lazy loading, blur-up)        │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### 1. LLM-Assisted Effect Parser

The biggest scaling bottleneck in M4 is hand-authoring effectSchema for every card. M6 automates this with Claude API.

#### Architecture

```
Card effectText (raw English)
  → Claude API (few-shot prompt with schema spec + examples)
  → Candidate effectSchema JSON
  → Confidence scoring
  → If high confidence → auto-accept
  → If low confidence → queue for human review
  → Validated effectSchema written to DB
```

#### Prompt Design

The prompt includes:
1. **System prompt:** "You are an OPTCG card effect parser. Translate card effect text into the following JSON schema."
2. **Schema specification:** Full EffectSchema TypeScript types (from M4 docs)
3. **Examples:** 15–20 hand-authored effectSchema samples covering all common patterns
4. **Card context:** Card name, type, color, cost, traits (helps disambiguate effect text)
5. **Output format:** Strict JSON output, no prose

**Prompt template:**
```
Given this OPTCG card:
  Name: {name}
  Type: {type}
  Color: {color}
  Cost: {cost}
  Traits: {traits}
  Effect Text: "{effectText}"

Translate the effect text into the following JSON schema:
{schema_spec}

Examples:
{examples}

Output ONLY the JSON effectSchema. No explanation.
```

#### Confidence Scoring

Each parsed result is scored on:
- **Structural validity:** Does the JSON match the schema? (binary)
- **Trigger accuracy:** Does the trigger type match keywords in the effect text? (heuristic)
- **Action coverage:** Are all clauses in the effect text represented in actions? (heuristic)
- **Known pattern match:** Does this effect match a template we've seen before? (fuzzy match)

| Confidence | Action |
|-----------|--------|
| ≥ 0.9 | Auto-accept, write to DB |
| 0.7 – 0.89 | Auto-accept with flag for spot-check |
| < 0.7 | Queue for human review |

#### Human Review Pipeline

A simple admin UI (or CLI tool) for reviewing flagged effects:
- Shows card image + effect text + LLM-generated JSON side by side
- Reviewer can accept, edit, or reject
- Edits feed back into the example set (improving future LLM accuracy)

#### Cost Estimation

Assuming ~1,500 total cards across all OPTCG sets:
- ~500 tokens per prompt (schema spec cached in system prompt)
- ~200 tokens per response
- Total: ~1,500 × 700 = ~1.05M tokens
- At Claude 3.5 Sonnet pricing: ~$3–5 total (very cheap)
- Multiple passes for low-confidence cards: 2–3x → ~$10–15 total

### 2. Full Card Database

#### Scale

As of 2026, OPTCG has released multiple sets (OP01 through OP10+). The pipeline must handle:

| Metric | Estimate |
|--------|---------|
| Total cards | ~1,500–2,000 |
| Art variants | ~500–800 (parallels, SECs, promos) |
| Card images | ~2,500–3,000 files |
| Image storage | ~2–3 GB (compressed WebP) |
| DB records | ~2,000 card rows |

#### Pipeline Scaling

- **Batch processing:** Run pipeline per-set; each set is independent
- **Incremental updates:** Diff against existing DB; only update changed cards
- **Errata tracking:** When a card's text changes, update `effectText` + re-run LLM parser for new `effectSchema`
- **New set onboarding:** Scrape → Parse → LLM-parse effects → Review → Publish (target: < 1 week per new set)

#### Image Optimization

- Convert all card images to WebP (30–50% smaller than JPEG)
- Generate multiple sizes: thumbnail (150px), grid (300px), detail (600px), full (900px)
- Serve via Cloudflare CDN with cache headers (cards are immutable once published)
- Lazy loading on card grids with blur-up placeholder

### 3. Spectator Mode

#### Design

- Friends of either player can join a game as spectators
- Spectators see the same game board as players, but:
  - Hands are hidden (or optionally shown with a delay)
  - No interaction buttons (read-only)
  - Spectator count shown to players
- Spectators join via a link shared by a player or from the friend's "in-game" status

#### Implementation

**WebSocket changes:**
- New room type: `game:{gameId}:spectators`
- Spectators receive `game:update` events (same as players)
- Spectator-specific state filtering: remove hand contents from broadcast
- Hand reveal option: host can enable "spectator hand view" (with configurable delay, e.g. 30 seconds)

**API changes:**
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/games/:id/spectate` | Join as spectator |
| `GET` | `/api/games/:id/spectators` | List spectators |
| `DELETE` | `/api/games/:id/spectate` | Leave spectator view |

**UI changes:**
- Spectator uses the same `GameBoard` component in read-only mode
- "Spectating" banner at top with spectator count
- Chat sidebar for spectator commentary (text-only, visible to other spectators)

### 4. Game Replay / Log Viewer

#### Design

After a game ends, either player can review the full game as a step-by-step replay.

#### Implementation

**Data source:** `GameActionLog` table (from M3) already stores every action with turn, phase, and timestamp.

**Replay engine:**
```typescript
class ReplayEngine {
  private actions: GameActionLog[];
  private currentIndex: number;
  private gameState: GameState;

  constructor(actions: GameActionLog[]) {
    this.actions = actions;
    this.currentIndex = 0;
    this.gameState = this.buildInitialState();
  }

  stepForward(): GameState {
    // Apply next action to game state
    this.currentIndex++;
    return this.applyAction(this.actions[this.currentIndex]);
  }

  stepBackward(): GameState {
    // Rebuild state from start up to currentIndex - 1
    this.currentIndex--;
    return this.rebuildState(this.currentIndex);
  }

  jumpToTurn(turn: number): GameState {
    // Rebuild state up to the first action of the given turn
  }

  getTimeline(): TimelineEntry[] {
    // Return summarized timeline for scrubber UI
  }
}
```

**UI:**
- Same `GameBoard` component, rendered from replay state
- Playback controls: start, back, play, forward, end
- Turn scrubber: slider or timeline showing all turns
- Speed control: 1x, 2x, 4x
- Action-by-action text log alongside the board

**Access:**
- Both players can access replay from their game history
- Replay link shareable (public replays as stretch goal)
- Spectators can also access replay after game ends

### 5. Performance Optimization

| Area | Optimization |
|------|-------------|
| Card search | Client-side index (Fuse.js or MiniSearch) for instant search if total cards < 5,000; server for complex filters |
| Card images | WebP format, responsive `srcset`, lazy loading, CDN cache |
| Game state | Delta updates over WebSocket (send only changes, not full state) |
| Bundle size | Dynamic imports for game board, replay viewer; tree-shake unused components |
| DB queries | Query plan analysis on card search; add indexes as needed |
| WebSocket | Binary protocol (MessagePack) if JSON overhead becomes measurable |

---

## Roadmap

| Step | Task | Est. |
|------|------|------|
| 1 | Build LLM effect parser (prompt design, Claude API integration) | 3–4 days |
| 2 | Build confidence scoring system | 1–2 days |
| 3 | Build human review CLI/UI | 1–2 days |
| 4 | Run LLM parser on all remaining sets, review results | 5–7 days |
| 5 | Scale data pipeline to all sets (scrape, parse, publish) | 3–4 days |
| 6 | Image optimization pipeline (WebP conversion, responsive sizes) | 1–2 days |
| 7 | Implement spectator WebSocket + UI | 3–4 days |
| 8 | Build replay engine + viewer UI | 3–4 days |
| 9 | Performance optimization pass | 2–3 days |
| 10 | Cross-browser testing + bug fixes | 2–3 days |

**Total estimate: ~22–32 days**

---

## Acceptance Criteria

- [ ] LLM parser produces valid effectSchema for ≥ 80% of cards without human intervention
- [ ] Human review pipeline clears remaining cards within 1 week per set
- [ ] All released OPTCG sets are fully populated in the card database
- [ ] Card images load in < 200ms (CDN, optimized formats)
- [ ] Spectators can watch a live game without affecting gameplay
- [ ] Spectator view correctly hides hand information
- [ ] Game replay accurately reproduces the full game state at every step
- [ ] Replay controls (forward, back, jump to turn) work correctly
- [ ] Lighthouse performance score ≥ 80 on key pages (card search, deck builder)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| LLM parser accuracy lower than expected | More manual review needed | Iterate on prompt with more examples; fine-tune or use structured output mode |
| New card mechanics not in schema vocabulary | Parser can't handle them | Schema is extensible — add new ActionTypes/TriggerTypes as mechanics are introduced |
| Replay engine slow for long games (300+ actions) | Laggy scrubber | Cache state snapshots every N actions; rebuild from nearest snapshot instead of from start |
| Full card image set exceeds R2 free tier | Storage costs | R2 free tier is 10GB — estimate 2–3GB for all images. Should be fine; monitor usage |
| Official OPTCG site structure changes break scraper | Pipeline fails silently | Store raw HTML snapshots; add scraper health checks; alert on parse failure rate > 5% |

---

## Dependencies

- M0–M4 complete (full game simulator with automated effects for 1–2 sets)
- M5 UI overhaul complete (shadcn components, new design system) — replay/spectator UIs built with new system
- Claude API key (for LLM effect parsing)
- All OPTCG set data accessible (scraper or community sources)

---

## Post-M6 Considerations

These are out of scope but worth tracking:

| Feature | Notes |
|---------|-------|
| AI/Bot opponent | Single-player mode; requires game-playing agent (hard problem) |
| Tournament brackets | Lobby system could extend to bracket management |
| Animated card effects | WebGL/Canvas rendering for flashy effect resolution |
| Native mobile app | React Native or Capacitor wrapper around the web app |
| Deck analytics | Win rate tracking per deck, meta analysis, popular card stats |
| Community features | Deck sharing, deck comments, user ratings |

---

_Last updated: 2026-03-30_
