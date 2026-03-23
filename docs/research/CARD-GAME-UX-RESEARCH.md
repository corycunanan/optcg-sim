# Card Game UI/UX Research — Deep Dive

> Comprehensive analysis of digital card game interfaces, interaction patterns, and design best practices.
> Includes case studies from MTG Arena, Hearthstone, Pokemon TCG Live, Balatro, Yu-Gi-Oh Master Duel, Legends of Runeterra, Slay the Spire, Catan Universe, and the existing OPTCG Sim.
> Concludes with actionable recommendations for this project.

---

## Table of Contents

1. [Universal Principles](#1-universal-principles)
2. [Case Study: Hearthstone](#2-case-study-hearthstone)
3. [Case Study: MTG Arena](#3-case-study-mtg-arena)
4. [Case Study: Pokemon TCG Live & Pocket](#4-case-study-pokemon-tcg-live--pocket)
5. [Case Study: Yu-Gi-Oh Master Duel](#5-case-study-yu-gi-oh-master-duel)
6. [Case Study: Legends of Runeterra](#6-case-study-legends-of-runeterra)
7. [Case Study: Balatro](#7-case-study-balatro)
8. [Case Study: Slay the Spire](#8-case-study-slay-the-spire)
9. [Case Study: Catan Universe](#9-case-study-catan-universe)
10. [Existing OPTCG Sim Analysis](#10-existing-optcg-sim-analysis)
11. [OPTCG Board Zones & Physical Layout](#11-optcg-board-zones--physical-layout)
12. [Cross-Game Interaction Patterns](#12-cross-game-interaction-patterns)
13. [Board Layout Proportions Across Games](#13-board-layout-proportions-across-games)
14. [Accessibility in Digital Card Games](#14-accessibility-in-digital-card-games)
15. [Recommendations for This Project](#15-recommendations-for-this-project)

---

## 1. Universal Principles

These principles recur across every successful digital card game, regardless of genre or complexity.

### 1.1 Information Hierarchy

- **Primary**: Health/life, active resources (mana/DON!!), immediate threats — must dominate visual space
- **Secondary**: Hand contents, opponent status, turn phase — accessible but subordinate
- **Tertiary**: Graveyard/trash, exile, deck count, game log — available on demand

Use size, color, contrast, and positioning to create unmistakable hierarchy. Critical game state should be readable at a glance; supplementary information should be one interaction away (hover, click, long-press).

### 1.2 Immediate Feedback

Every player action requires clear, responsive feedback:
- **Visual**: Card highlights, glow effects, position changes, zone transitions
- **Auditory**: Satisfying sounds for card plays, attacks, damage, resource changes
- **Temporal**: Animations should be fast enough to not block gameplay, but present enough to communicate state changes

Players should not need to wonder "did that work?" after any interaction.

### 1.3 Progressive Disclosure

Don't front-load all information. Reveal complexity as the player explores:
- Hover/tap for card details and tooltips
- Expand zones on demand (graveyard, exile, deck)
- Show keyword explanations inline, not in a separate glossary
- Keep the resting interface clean; let density emerge through interaction

### 1.4 Physicality and Tangibility

Digital card games that feel like manipulating real objects outperform purely abstract interfaces:
- Cards should have weight, momentum, and satisfying snap-to behavior
- Drag interactions should feel like moving a physical card
- Zones should feel like distinct physical spaces, not just data containers
- Sound design reinforces materiality (thuds, clicks, shuffles)

### 1.5 Respect Player Time

- Provide animation speed controls
- Allow shortcuts for common actions (pass turn, auto-resolve, auto-tap)
- Show clear turn timers with visual urgency cues
- Never force players to wait for animations they've seen hundreds of times

### 1.6 Card Art as Hero

In TCGs, the art is a primary draw. The UI should:
- Give cards generous display space
- Use clean, uncluttered backgrounds that let art breathe
- Provide a zoom/inspect mode for full card art
- Minimize UI chrome that competes with card visuals

---

## 2. Case Study: Hearthstone

**Developer**: Blizzard Entertainment | **Platform**: PC, Mobile, Tablet

### Design Philosophy

Hearthstone's core insight (presented at GDC 2015 by UI designer Derek Sakamoto): **"Our game is UI."** Rather than treating the interface as scaffolding for gameplay, the team made the UI *the experience itself*.

### The "Seed" Concept

The team established a unifying creative seed early in development: a wooden box revealing a World of Warcraft-inspired diorama sitting on a tavern table. Every design decision — from loading screens to the collection manager — traced back to this single vision. This gave the entire team a shared mental model that eliminated thousands of arbitrary decisions.

**Takeaway**: Establish a creative seed before designing the board. For this project, it could be the spirit of One Piece — an adventurous, warm, pirate-themed world.

### Physicality as Design Principle

Hearthstone rejected the trendy flat/minimalist interface style of its era and embraced physicality:
- Cards tilt and swoosh when held or played
- The game board thumps when tapped
- The collection manager resembles a jewelry box with satisfying click interactions
- Gold, gems, and materials convey value through visual texture
- Interactive board elements (clickable props, ambient animations) reward curiosity

This approach worked especially well on touch devices, making interactions feel like manipulating a physical game board. The emotional connection was so strong that fans recreated game pieces in woodworking and cakes.

**Trade-offs acknowledged**: Physicality increases production cost per new element (heroes, boards, card backs all need bespoke modeling/animation). Navigation can suffer when flavor is prioritized over efficiency.

### Board Layout

| Zone | Position | Approximate Screen % |
|------|----------|---------------------|
| Opponent hand | Top center | ~8% |
| Opponent hero + hero power | Top center-right | ~5% |
| Opponent battlefield (minions) | Upper-center | ~20% |
| Player battlefield (minions) | Lower-center | ~20% |
| Player hero + hero power | Bottom center-right | ~5% |
| Player hand | Bottom center (overflow off-screen) | ~12% |
| Mana crystals | Bottom-right | ~3% |
| End turn button | Right center | ~3% |
| Deck/history | Left side | ~4% |
| Board/decorative area | Background, edges | ~20% |

The board is split into a **symmetric upper/lower layout** with a prominent horizontal divider (the "game board" surface). Key insight: Hearthstone gives ~40% of screen space to the actual battlefields and ~20% to hands, with the remaining 40% devoted to heroes, UI chrome, and the immersive board aesthetic.

### Onboarding

- Color changes indicate active UI elements (buttons shift from yellow to green)
- Visual arrows guide attention to interactive elements
- NPC characters give direct, simple commands (rarely more than 2 sentences)
- Sound and animation reinforce learning without heavy text
- Victory animations celebrate achievements

### Communication

Emote system with preset phrases ("Well Played!", "Greetings", "Oops"). Intentionally limited to prevent toxicity while maintaining social presence. Players can squelch (mute) opponents.

---

## 3. Case Study: MTG Arena

**Developer**: Wizards of the Coast | **Platform**: PC, Mobile

### Board Layout

MTG Arena's layout is significantly more complex than Hearthstone due to the game's intricate zone system:

| Zone | Position | Notes |
|------|----------|-------|
| Player hand | Bottom center | Bottom halves extend off-screen; hover to reveal full card |
| Phase strip | Above hand | Untap → Main 1 → Combat → Main 2 → End Step; illuminated orange for current phase |
| Player avatar + life | Center of phase strip | Includes fuse timer for slow play |
| Lands | Row closest to player | Horizontal row between hand and creatures |
| Creatures/Permanents | Center | Closer to battlefield midline |
| Enchantments/Artifacts | Right of lands | Non-creature permanents grouped separately |
| Planeswalkers | Far right | Above pass/end turn buttons |
| Library + Graveyard + Exile | Left of hand | Grouped together; hover for count, click to browse |
| Opponent zones | Top (mirrored) | Same layout inverted |
| Pass/End Turn buttons | Bottom-right | Spacebar = pass priority, Enter = end turn |
| Timeout indicators | Above buttons | Dots + hourglass; earned by playing quickly |
| Stack | Center overlay | Spells/abilities being resolved |

### Key Design Decisions

**Playable card highlighting**: Cards with enough mana show a blue outline, immediately communicating what's available. This is one of digital TCG's most important UX patterns — reducing the cognitive load of "what can I do right now?"

**Phase strip**: The explicit phase visualization with clickable stops lets players set auto-pauses for specific phases, giving control over the priority system without manual passing.

**Timeout system**: Rather than a simple chess clock, MTG Arena rewards fast play with banked timeouts. Three dots fill up when you play quickly, converting to timeout tokens. This elegantly solves the problem of punishing players who occasionally need to think deeply.

### Known UX Problems

- Cards flash briefly during opponent plays, making it hard to read what happened
- No persistent turn log to review game events
- Exiled cards sometimes hard to access
- Reminder text disappears during decision windows
- Battles (a new card type) proved that "the paper solution doesn't translate to digital" — fully horizontal card display was impractical digitally

### Key Lessons

1. **Digital-first design**: Don't blindly replicate paper layout. Optimize for screen, mouse/touch, and information density
2. **Priority communication**: Make it crystal clear whose turn it is, what phase you're in, and what's expected of the player
3. **Action legibility**: Every card play, especially the opponent's, needs enough screen time and visual space to be read and understood

---

## 4. Case Study: Pokemon TCG Live & Pocket

**Developer**: The Pokemon Company / DeNA | **Platform**: PC, Mobile

### Strengths

- **Clean, intuitive layout** inspired by modern CCGs
- **Logical mapping to physical play**: Cards fan out as if in your hand, energy tokens are dragged onto cards
- **Visual signifiers**: Pulsing lights and colors indicate usable/playable components
- **Responsive controls** that are intuitive within matches
- **Optional ability highlighting** with tooltips for mechanic explanations
- **Smart notifications** for booster packs with timers and anti-affordance (preventing accidental actions)
- **Mobile-friendly scaling**: Cards resize to approximately printed size on phone screens

### Weaknesses

- **Bland visual environment**: No custom battlefields, playmats, or VFX when playing cards (a VFX update has been announced)
- **Hidden features**: Wishlist and other features not discoverable; unlabeled toggles create friction
- **Poor search/filtering**: Pack Points lack search, filtering, or type organization — forces manual scrolling
- **No battle log**: Harder to track what happened during complex turns

### Pokemon TCG Pocket UI Critique

The mobile-focused Pocket app has received specific UI criticism:
- Navigation structure is unintuitive
- Feature discoverability is poor
- Core actions require too many taps
- But the card presentation (full-art, 3D tilt effects) is exceptional

### Key Lessons

1. **Map to physical expectations**: Players who know the physical game expect digital interactions to mirror real-world actions (drag energy onto cards, fan hand cards)
2. **Feature discoverability matters**: Hidden functionality frustrates experienced users
3. **Card presentation is a differentiator**: Pokemon TCG Pocket proves that making cards look and feel premium creates emotional engagement even in a simpler format

---

## 5. Case Study: Yu-Gi-Oh Master Duel

**Developer**: Konami | **Platform**: PC, Mobile, Console

### Board Layout

Master Duel faithfully translates the complex Yu-Gi-Oh field:

| Zone | Count | Notes |
|------|-------|-------|
| Main Monster Zones | 5 | For summoned monsters |
| Spell & Trap Zones | 5 | Mirroring monster zones |
| Pendulum Zones | 2 | Flanking the field |
| Extra Monster Zones | 2 | Shared between players |
| Field Zone | 1 | For Field Spells |
| Deck Zone | 1 | Draw pile |
| Graveyard | 1 | Discard/destroyed cards |
| Banished Zone | 1 | Removed from play |

### Interaction Design

- **Card Status Icons**: Color-coded blue for player's cards, red for opponent's
- **Effect negation indicators**: Visual markers show when effects are negated
- **Activation Confirmation**: Configurable toggle for when effects require player confirmation
- **Duel Log**: Toggle-able log showing recent card actions
- **Pinnable Info Screens** (v2.4.0): Auto-close toggle for persistent card details

### Key Lessons

1. **Complex games need a duel/game log**: When many effects can trigger in sequence, players need a reviewable history
2. **Status icons reduce cognitive load**: Color-coded, standardized icons communicate card state at a glance
3. **Configurable automation**: Let players choose how much the game auto-resolves vs. prompts for confirmation

---

## 6. Case Study: Legends of Runeterra

**Developer**: Riot Games | **Platform**: PC, Mobile

### Board Layout

- **Hand**: Maximum 10 cards, displayed at bottom
- **Unit Line**: Maximum 6 units, main board area
- **Spell Lines**: Separate track for spell resolution
- **Nexus (Health)**: Central, maximum 20 HP
- **Mana Crystals + Spell Mana**: Resource display
- **Event Log**: Recent card actions
- **Player Info**: Name, deck regions

### Design Evolution

Riot's UI team pivoted from treating the client as a "Runeterran guidebook" (ornate, themed) to a **flatter, more minimalistic approach** that maintained shared functional elements. This mirrors a broader industry trend: start immersive, simplify for usability.

### Key Innovations

- **Spell mana banking**: Unused mana carries over as "spell mana," displayed as separate glowing orbs. The visual distinction between regular and spell mana is immediately clear
- **Attack/defense track**: A horizontal track in the center where units are placed during combat, making attack order and blocking assignments spatially intuitive
- **Champion level-up animations**: Full-screen cinematic moments when champion conditions are met — rewards player accomplishment without slowing gameplay

### Key Lessons

1. **Spatial combat layout**: Using a dedicated track/lane for combat resolution makes complex interactions legible
2. **Celebrate key moments**: Brief, impactful animations for milestones (champion level-ups, lethal damage) create memorable moments
3. **Simplify visual chrome over time**: Start themed, iterate toward clarity

---

## 7. Case Study: Balatro

**Developer**: LocalThunk (solo developer) | **Platform**: PC, Mobile, Console

Balatro is not a TCG but demonstrates masterclass UI/UX for card-based games. It won multiple Game of the Year awards in 2024.

### Visual Design: Retro Simulation

Balatro creates a "last-century arcade retro" aesthetic through precise simulation of legacy display technology:
- **CRT edge distortion**: Simulating curved monitor curvature
- **Scanlines and moiré patterns**: Replicating early TV screen characteristics
- **Pixelated edge processing**: UI text and card outlines retain distinct pixelation

The strict visual constraints (color palette rules, art resolution standards, UI standardization) create a cohesive identity far more memorable than high-fidelity alternatives.

### Card Material System

Over 150 Joker cards feature intuitive visual feedback:
- **Material-based textures**: Gold (generates gold), Glass (fragile, high multiplier), Foil, Negative, Steel, Stone — each material texture immediately communicates the card's mechanical properties
- **Dynamic lighting on hover**: Materials display realistic lighting changes when the cursor moves over them
- **Mechanic-narrative resonance**: Card illustrations and mechanics align with real-world context (e.g., banana cards referencing the Gros Michel/Cavendish historical context), reducing cognitive load

### Information Architecture

- **Dynamic backgrounds**: Background color and texture change for Boss Blinds and Booster Packs, acting as visual anchors that signal context shifts without intrusive UI pop-ups
- **Progressive disclosure**: No standalone tutorials or index menus. Hovering over any card/icon with affixes instantly displays clear tooltips. "On-demand" approach keeps the interface clean
- **Color psychology**: Dark green casino-table background highlights saturated Joker cards and scoring effects. Interface zones are clearly divided: information (left), interaction (bottom), status (top)

### "Juice" and Microinteractions

This is Balatro's most studied design feature:
- **High-density audiovisual feedback during scoring**: Screen shake, card flip animations, exponentially jumping numbers, rising fire effects, and crisp chip sounds form a sensory stimulation package
- **Simulated physical inertia**: When rearranging hand cards, adjacent cards are pushed with a convincing physical response. Magnetic damping creates satisfying snap-to-position behavior
- **Audiovisual synchronization**: The frequency of jumping score numbers synchronizes with the pitch of background audio, creating dual-channel amplification of satisfaction
- **Customizable pacing**: Global speed adjustment lets players compress waiting animations, shortening the feedback loop and respecting player autonomy

### "Ruthless Design" Philosophy

Creator LocalThunk emphasized that removing entire systems often made the game more enjoyable. Balatro's final form is the result of aggressive subtraction — every remaining element earns its place.

### Key Lessons

1. **Juice transforms spreadsheets into experiences**: The underlying math is simple addition and multiplication, but animation and audio make it euphoric
2. **Constraint breeds identity**: A strict visual system (pixel art, CRT effects, limited palette) is more memorable than unconstrained high-fidelity
3. **Material metaphors reduce cognitive load**: Giving cards physical materials that map to their mechanics lets players understand effects before reading text
4. **Speed controls are not optional**: Players must be able to control pacing

---

## 8. Case Study: Slay the Spire

**Developer**: MegaCrit | **Platform**: PC, Mobile, Console

### Critical Design Discovery: Enemy Intent

Slay the Spire's original interface nearly killed the game. Through playtesting (especially for streaming), the developers discovered that **revealing enemy intent was crucial for strategic engagement**. The "intent" system — showing what enemies plan to do next — replaced the opaque "next move" indicator, transforming the game from frustrating to strategic.

### UI Redesign Lessons

- **Pentagon ability displays**: Character selection shows strengths/weaknesses in a radar chart format, enabling quick grasp of character identity
- **Bag storage for relics**: Moving relics into a hover-accessible bag cleaned up the main interface while maintaining information availability
- **Hover-accessible elements**: Reducing permanent on-screen elements while keeping everything one hover away

### Key Lessons

1. **Information that looks optional may be essential**: Test whether hiding information changes strategic depth
2. **Streaming-friendly UI**: If your game will be watched, the interface needs to be legible to viewers too
3. **Reduce visual clutter through progressive disclosure, not removal**: Don't delete information — layer it

---

## 9. Case Study: Catan Universe

**Developer**: Exozet / Catan GmbH | **Platform**: PC, Mobile, Web

### What Went Wrong (2.0 Redesign)

Catan Universe's 2.0 redesign (June 2020) is a cautionary tale of ignoring core UX heuristics:

- **Crowded HUD**: Unnecessary UI elements, including an eight-icon vertical menu that could be consolidated
- **Information illegibility**: Card information difficult to read; can't easily see what cards you hold or track opponent progress
- **Dangerous button placement**: Dice roll and skip turn buttons positioned identically, causing accidental turn-ending misclicks
- **Inadequate turn feedback**: Visual feedback during other players' turns too small and too fast to follow
- **Communication limitations**: Only emoji-based communication, no text chat

### Key Lessons

1. **Button placement has stakes**: Destructive or irreversible actions (end turn, concede) must be visually and spatially distinct from routine actions
2. **Opponent turn visibility**: Players need to understand what happened during other players' turns, not just their own
3. **Regression testing for redesigns**: A redesign that breaks working patterns is worse than no redesign

---

## 10. Existing OPTCG Sim Analysis

**Developer**: Batsu (solo developer) | **Platform**: Windows, Mac, Linux, Android, iOS | **Engine**: Unity

The OPTCG Sim is the de facto standard for online One Piece card game play. It's used by the global competitive community for practice, testing, and ranked play via third-party Discord integrations.

### Pros

| Category                       | Details                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| **Free and accessible**        | Completely free, no monetization gate. Available on all major platforms             |
| **Community standard**         | Near-universal adoption in the OPTCG competitive community                          |
| **Comprehensive card library** | All sets up to current releases (OP16, ST30 as of March 2026), with regular updates |
| **Format support**             | Standard, Extra Regulation, Western, Eastern, Unlimited, Private lobbies            |
| **Ranked integration**         | Third-party ranked system via Discord community                                     |
| **Deck import/export**         | Compatible with popular deckbuilding sites (NakamaDecks, onepiece-cardgame.dev)     |
| **Actively maintained**        | Regular patches with bug fixes, new cards, and feature improvements                 |
| **Solo practice**              | "Solo v Self" mode for learning and testing without an opponent                     |
| **Save/Load state**            | Beta feature allowing game state snapshots for replay analysis                      |
| **Cross-format lobbies**       | Players can choose which card pool/banlist to play with                             |
| **Auto-patcher**               | Windows version auto-updates from v1.24d onwards                                    |
| **Custom card art**            | Players can replace card images with alternate arts                                 |
| **Turn timer**                 | Lobby-level turn timer added in v1.24a                                              |
| **Rotation support**           | Standard/Extra Regulation split added in v1.37a                                     |
| **Settings toggles**           | Options to prevent common mistakes (accidental DON!! attachment, etc.)              |

### Cons

| Category | Details |
|----------|---------|
| **No rules enforcement** | The sim is primarily a "tabletop simulator" — players must know and enforce rules manually. Many effects require manual resolution rather than automatic game logic |
| **Unity-based desktop app** | Requires download and installation; no web-based option. iOS requires sideloading |
| **Minimal visual polish** | Functional but aesthetically basic. Wood table background, simple card rendering, no VFX for card plays or attacks |
| **No card play animations** | Cards appear in zones without transition animations. No attack animations, no KO effects, no DON!! attachment visuals |
| **No game log** | No persistent log of actions taken during a game. Players must pay close attention or miss opponent actions |
| **Limited onboarding** | No tutorial. New players must learn the game elsewhere and figure out the sim through trial and error |
| **Frequent card bugs** | Complex card interactions often break and require patches. "Save from KO" effects, simultaneous triggers, and chain effects are common sources of bugs |
| **No spectator mode** | Cannot watch games in progress |
| **Manual DON!! management** | Players must manually attach, return, and manage DON!! cards each turn — a significant source of user error |
| **Click-based interaction only** | No drag-and-drop for card plays; interactions are entirely click-based |
| **Font/display issues** | Android users report missing fonts (pink/purple blocks). Controller interference causes click issues on PC |
| **No matchmaking** | No skill-based matchmaking. New players face full meta decks immediately |
| **Deck editor limitations** | Basic filtering, no advanced search syntax, must manually select colors to see cards |
| **No mobile optimization** | Mobile experience is a scaled-down desktop UI, not a touch-first design |
| **Communication limited** | Text chat only, no emote system, no structured communication |
| **Trash view bugs** | Trash view difficult to close during certain actions (patched but recurring) |
| **No card zoom** | Limited ability to inspect card art and text in detail during gameplay |
| **No undo for misclicks** | Accidental card plays or DON!! attachments cannot be reversed |

### Board Layout (Estimated Proportions)

Based on available screenshots and gameplay descriptions, the OPTCG Sim board layout is approximately:

```
┌─────────────────────────────────────────────────────────┐
│  Opponent Hand (hidden, card backs)           ~8% height│
├─────────────────────────────────────────────────────────┤
│  Opponent Field                              ~25% height│
│  ┌────────────────────────────────────────┐             │
│  │  [Char][Char][Char][Char][Char]        │ Characters  │
│  │  [Leader]  [Stage]                     │ Leader/Stage│
│  │  [Life]              [DON!! Deck][Deck]│ Support     │
│  │           [Cost Area / DON!!]    [Trash]│ Resources  │
│  └────────────────────────────────────────┘             │
├─────────────────────────────────────────────────────────┤
│  ═══════════ Center Divider / Game Info ═══════════ ~4% │
├─────────────────────────────────────────────────────────┤
│  Player Field                                ~25% height│
│  ┌────────────────────────────────────────┐             │
│  │           [Cost Area / DON!!]    [Trash]│ Resources  │
│  │  [Life]              [DON!! Deck][Deck]│ Support     │
│  │  [Leader]  [Stage]                     │ Leader/Stage│
│  │  [Char][Char][Char][Char][Char]        │ Characters  │
│  └────────────────────────────────────────┘             │
├─────────────────────────────────────────────────────────┤
│  Player Hand (face-up)                       ~12% height│
├─────────────────────────────────────────────────────────┤
│  Action Buttons / Phase Controls              ~6% height│
└─────────────────────────────────────────────────────────┘
```

**Note**: The OPTCG Sim uses a top-down orthographic view with card thumbnails. Cards in the character area are arranged horizontally. The board uses a wood-textured background. Resting (tapped) cards are rotated 90 degrees.

### Interaction Model

| Action | Interaction | Notes |
|--------|-------------|-------|
| Play a card from hand | Click card in hand, click target zone | Two-click pattern |
| Attach DON!! | Click DON!! in cost area, click target card | Manual, error-prone |
| Attack | Click attacking card, click target | Two-click; must manually select attacker and defender |
| Rest/activate | Automated on attack | Cards rotate 90° |
| Draw card | Click deck or use button | Beginning of turn |
| View trash | Click trash pile | Opens overlay; has had closing bugs |
| Counter | Click counter cards from hand | During opponent's attack phase |
| Mulligan | Button prompt at game start | Standard mulligan flow |
| DON!! return | Manual at refresh phase | Must return attached DON!! manually |
| View card details | Hover over card | Shows enlarged card art and text |
| Right-click DON!! area | Visually separates DON!! cards | Added in v1.21a for clarity |

---

## 11. OPTCG Board Zones & Physical Layout

The official One Piece Card Game uses these zones (from the official play guide):

### Zone Definitions

| # | Zone | Purpose | Capacity |
|---|------|---------|----------|
| 1 | **Character Area** | Play Character cards | Max 5 |
| 2 | **Leader Card** | Leader card placement (face-up) | Exactly 1 |
| 3 | **Stage Card** | Stage card placement | Max 1 |
| 4 | **Deck** | Draw pile | 50 cards at start |
| 5 | **Trash** | KO'd characters, used events | Unlimited |
| 6 | **Cost Area** | DON!! cards for paying costs / power-ups | Up to 10 |
| 7 | **DON!! Deck** | DON!! card supply | Exactly 10 at start |
| 8 | **Life Cards** | Face-down life cards | Determined by Leader |

### Physical Playmat Layout

Standard OPTCG playmats (24" × 14") arrange zones as follows:

```
Player's perspective (looking at their own side):

          ┌──────────────────────────────────┐
          │      CHARACTER AREA (1-5)        │  ← Closest to opponent
          │  [C1] [C2] [C3] [C4] [C5]       │
          ├──────┬────────────┬──────────────┤
          │STAGE │  LEADER    │              │
          │ (3)  │   (2)      │              │
          ├──────┴────────────┤    DECK (4)  │
          │    LIFE CARDS     │    TRASH (5) │
          │      (8)          │              │
          ├───────────────────┴──────────────┤
          │          COST AREA (6)           │  ← Closest to player
          │   DON!! DECK (7)    [DON!!...]   │
          └──────────────────────────────────┘
```

### Key Spatial Relationships

- Characters are in front of (closer to opponent than) the Leader
- The Leader is central, flanked by the Stage on one side
- Life cards sit between the Leader row and the Cost Area
- The Deck and Trash are on the right side
- The DON!! Deck and Cost Area span the bottom (closest to the player)
- Active vs. resting is indicated by card orientation (portrait = active, landscape = resting)

### Digital Translation Considerations

The physical layout assumes a ~1.7:1 aspect ratio playmat viewed from one player's perspective. For a digital simulator displaying both players:
- The board must show two mirrored fields plus hands, requiring ~3:1 vertical content ratio
- Card sizes must balance readability with fitting all zones on screen
- DON!! management is the most interaction-heavy zone and needs ergonomic priority
- Life cards are hidden information — their count is public but contents are not (until revealed)

---

## 12. Cross-Game Interaction Patterns

### Card Play Methods

| Method | Games Using It | Pros | Cons |
|--------|---------------|------|------|
| **Drag-and-drop** | Hearthstone, LoR, Pokemon TCG | Intuitive, tactile, mirrors physical play | Harder on mobile, requires precise targeting |
| **Click-to-select, click-to-place** | OPTCG Sim, MTG Arena (partial) | Works well with complex targeting, good for mice | Less tactile, two-step process |
| **Click-to-play (auto-place)** | Hearthstone (spells), Balatro | Fastest, fewest interactions | Removes player agency over placement |
| **Hybrid** | MTG Arena, LoR | Drag for simple plays, click for complex targeting | Must handle mode switching gracefully |

**Recommendation**: Hybrid approach. Drag-and-drop for card plays, DON!! attachment, and attacks (matching physical feel). Click targeting for complex effects (search, choose, target selection).

### Targeting Patterns

| Pattern | Description | Used By |
|---------|-------------|---------|
| **Arrow/line targeting** | Drag from source, arrow follows to target | Hearthstone, LoR |
| **Highlight valid targets** | Glow or outline valid targets when action begins | All major TCGs |
| **Zone-based** | Drop card into zone, auto-resolve | Simpler card games |
| **Sequential selection** | Click each target in order | Yu-Gi-Oh Master Duel |

### Turn Structure Communication

| Pattern             | Description                                  | Used By          |
| ------------------- | -------------------------------------------- | ---------------- |
| **Phase strip**     | Visual timeline of turn phases               | MTG Arena        |
| **Central button**  | Prominent "End Turn" with phase auto-advance | Hearthstone      |
| **Rope/fuse timer** | Visual urgency indicator for slow play       | Hearthstone, LoR |
| **Chess clock**     | Banked time with timeout rewards             | MTG Arena        |
| **Turn indicator**  | Color/animation showing whose turn it is     | All              |

### Card Inspection

| Pattern | Description | Used By |
|---------|-------------|---------|
| **Hover enlarge** | Card enlarges in place on hover | All desktop TCGs |
| **Long-press zoom** | Touch-hold for mobile inspection | Mobile TCGs |
| **Tooltip overlays** | Keyword explanations appear adjacent | LoR, Balatro |
| **Full-screen inspect** | Dedicated full-art view mode | Pokemon TCG Pocket |
| **Board-aware positioning** | Enlarged card avoids covering important zones | LoR, Hearthstone |

### Hand Management

| Pattern | Description | Used By |
|---------|-------------|---------|
| **Fan layout** | Cards fan out in an arc | Hearthstone, LoR |
| **Linear spread** | Cards in a horizontal row | MTG Arena, OPTCG Sim |
| **Overflow compression** | Cards overlap more as hand grows | All |
| **Hover lift** | Hovered card rises above others | Hearthstone, LoR |
| **Reorder on drag** | Adjacent cards shift when one is dragged | Balatro |

---

## 13. Board Layout Proportions Across Games

### Vertical Space Distribution (approximate)

| Zone                 | Hearthstone | MTG Arena | LoR | Yu-Gi-Oh MD | OPTCG Sim |
| -------------------- | ----------- | --------- | --- | ----------- | --------- |
| Opponent hand        | 8%          | 6%        | 6%  | 5%          | 8%        |
| Opponent field       | 20%         | 22%       | 18% | 25%         | 25%       |
| Center/divider       | 12%         | 8%        | 12% | 5%          | 4%        |
| Player field         | 20%         | 22%       | 18% | 25%         | 25%       |
| Player hand          | 12%         | 10%       | 14% | 10%         | 12%       |
| UI chrome/controls   | 8%          | 12%       | 10% | 10%         | 6%        |
| Aesthetic/decorative | 20%         | 20%       | 22% | 20%         | 20%       |

### Horizontal Space Distribution (approximate)

| Zone | Hearthstone | MTG Arena | LoR | Yu-Gi-Oh MD |
|------|-------------|-----------|-----|-------------|
| Left sidebar (deck/log) | 5% | 10% | 8% | 10% |
| Main battlefield | 75% | 65% | 70% | 65% |
| Right sidebar (buttons/info) | 10% | 15% | 12% | 15% |
| Decorative margins | 10% | 10% | 10% | 10% |

### Key Proportional Insights

1. **~60-75% of screen width** should be the main battlefield across all games
2. **~40-50% of screen height** is devoted to the two player fields combined
3. **Hand areas collectively take ~15-25%** of vertical space
4. **UI controls take ~8-12%** — more complex games (MTG) need more
5. **Decorative/immersive elements take ~10-20%** — this is where Hearthstone and Balatro excel
6. **OPTCG's unique challenge**: The DON!! Cost Area is a large, interaction-heavy zone with no direct analog in other TCGs. It needs ~10-15% of the player's field area dedicated to it

---

## 14. Accessibility in Digital Card Games

### Current Industry State

Accessibility in digital card games is still maturing. Notable examples:

- **Hearthstone Access**: A community-built mod adding full keyboard navigation and screen reader support. Demonstrates that card games are inherently compatible with accessibility because most information is structured text
- **Dawncaster**: Uses Unity Accessibility plugin with NVDA screen reader, proving that keyboard-only controls can enable efficient gameplay
- **Slay the Spire**: Offers text adjustment and audio support features

### Key Accessibility Considerations for OPTCG

| Feature | Priority | Notes |
|---------|----------|-------|
| **Color-blind modes** | High | TCG card colors (Red, Blue, Green, Purple, Black, Yellow) are functional identifiers. Must have alternative indicators (icons, patterns) |
| **Text scaling** | High | Card text must be readable at multiple zoom levels |
| **Keyboard navigation** | Medium | All game actions should be possible without a mouse |
| **Screen reader support** | Medium | Card names, effects, game state announcements |
| **Animation reduction** | Medium | Respect `prefers-reduced-motion` |
| **Focus indicators** | High | Clear, visible focus states for all interactive elements |
| **Contrast ratios** | High | WCAG AA minimum (4.5:1 for text) |
| **Touch target sizes** | High (mobile) | Minimum 44×44px tap targets |

---

## 15. Recommendations for This Project

Based on the research above, here are specific, prioritized recommendations for the OPTCG Simulator.

### 15.1 Establish a Creative Seed

Following Hearthstone's approach, define a unifying vision before designing the board:

**Proposed seed**: "The captain's table on the Thousand Sunny." A bright, warm wooden surface — not dark/gritty — with nautical elements that evoke One Piece's adventurous spirit. The play surface is clean and inviting. Card art is the hero.

This aligns with the existing brand personality (Adventurous, Warm, Confident) and the official OPTCG website's aesthetic (bright white surfaces, deep navy, gold accents).

### 15.2 Board Layout Design

#### Recommended Proportions (16:9 desktop)

```
┌────────────────────────────────────────────────────────────┐
│ Opponent Info Bar (name, life count, DON!! count)   ~5%    │
├────────────────────────────────────────────────────────────┤
│ Opponent Field                                     ~28%    │
│   Characters (5 slots) | Leader | Stage                    │
│   Life (count) | DON!! Cost Area | Deck/Trash              │
├────────────────────────────────────────────────────────────┤
│ ══════ Phase Strip / Turn Indicator ══════          ~4%    │
├────────────────────────────────────────────────────────────┤
│ Player Field                                       ~28%    │
│   Characters (5 slots) | Leader | Stage                    │
│   Life (count) | DON!! Cost Area | Deck/Trash              │
├────────────────────────────────────────────────────────────┤
│ Player Hand                                        ~15%    │
├────────────────────────────────────────────────────────────┤
│ Action Bar (phase controls, pass, end turn)         ~5%    │
└────────────────────────────────────────────────────────────┘

Horizontal:
│ 8% sidebar │ 72% main battlefield │ 12% info panel │ 8% │
```

#### Field Zone Arrangement (each player's half)

```
         ┌──────────────────────────────────────────┐
         │     [C1]  [C2]  [C3]  [C4]  [C5]        │  Characters
         │                                          │  (closest to
         │  [Stage]  [Leader]         [Life ×N]     │  center)
         │                                          │
         │  [DON deck]  [DON! DON! DON! ...]  [Deck]│  Cost Area
         │                                 [Trash]  │
         └──────────────────────────────────────────┘
```

### 15.3 Interaction Design

#### Card Play: Drag-and-Drop Primary, Click Secondary

- **Drag from hand to field**: Play characters, stages, events. Show valid drop zones with glow/highlight
- **Drag DON!! onto cards**: Attach DON!! for power boost. This is the most common interaction and must feel tactile
- **Click targeting**: For effects that require choosing targets (search, KO, bounce), highlight valid targets and let player click
- **Arrow targeting for attacks**: Drag from attacker to target, showing an arrow/line. Mirrors physical "turning sideways to attack"

#### DON!! Management (Critical UX Challenge)

DON!! is the most unique and interaction-heavy resource in OPTCG. Recommendations:
- **Auto-DON!! phase**: Automatically add 2 DON!! from the DON!! deck to the cost area each turn
- **Quick-attach**: Double-click DON!! to attach to Leader (most common target)
- **Drag-attach**: Drag DON!! to any card to attach
- **Bulk-attach button**: "Attach X DON!!" with a count selector for paying costs
- **Auto-return on refresh**: Automatically return all attached DON!! during Refresh Phase
- **Visual DON!! count**: Show active DON!! as a number badge on each card, not individual card overlays. Individual DON!! cards shown in the cost area

#### Turn Flow Communication

Following MTG Arena's phase strip pattern, adapted for OPTCG:

```
[Refresh] → [Draw] → [DON!!] → [Main] → [End]
```

- Current phase illuminated with accent color
- Refresh/Draw/DON!! phases auto-advance with brief animation
- Main Phase is where all player agency occurs — make this visually prominent
- End Turn button must be **visually distinct and positioned away from common actions** (lesson from Catan Universe)

### 15.4 Visual Feedback and "Juice"

Learning from Balatro and Hearthstone:

| Action | Recommended Feedback |
|--------|---------------------|
| Play a card | Card slides from hand to field with slight overshoot and settle. Soft thud sound |
| Attach DON!! | DON!! card flies to target with a brief glow. Satisfying click sound. Power number pulses |
| Attack declaration | Attacker tilts toward target. Arrow connects them. Tension sound |
| Damage dealt | Screen edge flash. Life card flips. Impact sound |
| KO | Card shatters/fades with particle effect. Slides to trash |
| Counter | Counter cards fly from hand. Shield/block visual. Defensive sound |
| Draw card | Card slides from deck to hand with a satisfying sweep |
| DON!! phase | Two DON!! cards flip from DON!! deck to cost area. Resource gain sound |
| Turn change | Phase strip shifts. "Your Turn" / "Opponent's Turn" indicator |

**Speed control**: Global animation speed slider (0.5x, 1x, 1.5x, 2x). Respect player time.

### 15.5 Information Architecture

#### Always Visible
- Both players' life card counts
- Both players' active DON!! counts
- Current phase indicator
- Player hand
- All cards on both fields
- Turn timer (if enabled)

#### One Interaction Away (hover/click)
- Full card text and art (hover enlarge)
- Keyword tooltips (hover)
- Trash contents (click trash pile)
- Deck count (hover deck)
- Attached DON!! details (hover card with DON!!)
- Game log panel (toggle)

#### Two Interactions Away
- Full card art inspect mode
- Opponent's public zones (trash, removed)
- Game settings
- Concede/forfeit

### 15.6 Game Log

**This is a gap in OPTCG Sim that must be filled.** Following Yu-Gi-Oh Master Duel and LoR:

- Collapsible side panel showing chronological game events
- Each entry: `[Turn X] [Player] [Action] [Card Name]`
- Clickable entries that highlight the relevant card on the board
- Filter by: All, My Actions, Opponent Actions, Effects
- Auto-scroll to latest, but scrollable for history review

### 15.7 Onboarding

Following Hearthstone's approach (not Pokemon TCG's hidden-feature problem):

1. **Interactive tutorial**: Guided game against AI with step-by-step phase explanations
2. **Progressive unlock**: Start with basic play, introduce effects/keywords gradually
3. **Contextual tooltips**: First-time prompts for each interaction type ("Drag DON!! onto a card to power it up!")
4. **Practice mode**: Solo v Self with an "undo" button and move suggestions
5. **No forced tutorial**: Let experienced players skip directly to play

### 15.8 Mobile-First Considerations

If mobile is in scope (and it should be — OPTCG Sim's mobile experience is weak):

- **Bottom-weighted interaction**: Primary actions in thumb-reach zone
- **Long-press for inspect**: Replace hover with long-press on mobile
- **Swipe gestures**: Swipe up to play from hand, swipe to attach DON!!
- **Simplified DON!! UI**: Larger touch targets for DON!! management
- **Portrait orientation option**: For casual play (competitive stays landscape)
- **Responsive card sizing**: Cards should be readable at phone scale (Pokemon TCG Live does this well)

### 15.9 Communication System

OPTCG is a social game. Recommendations:

| Feature | Priority | Rationale |
|---------|----------|-----------|
| **Emote system** | High | Pre-set phrases ("Good Game!", "Nice Play!", "Thinking..."). Prevents toxicity, maintains social presence |
| **Text chat** | Medium | Optional, toggleable. Important for friends/private matches |
| **Mute opponent** | High | Essential for any communication system |
| **Animated emotes** | Low | One Piece character reactions (Luffy laughing, Zoro sleeping, etc.) would be delightful |

### 15.10 Deck Builder UX

The deck builder is a separate but critical interface. Recommendations from cross-game research:

- **Powerful search**: Full-text search across card names, effects, keywords, types
- **Advanced filters**: Color, cost, power, type, set, keyword, rarity
- **Real-time validation**: Show deck legality as cards are added (50-card limit, 4-copy limit, color restrictions)
- **Visual deck composition**: Mana curve / cost curve chart
- **Import/export**: Clipboard, URL, popular deckbuilding sites
- **Collection-aware** (future): Show owned vs. missing cards
- **Compare view**: Side-by-side card comparison for deckbuilding decisions

### 15.11 Competitive Features

Features that differentiate from OPTCG Sim for serious players:

| Feature | Description |
|---------|-------------|
| **Replay system** | Save and review completed games turn by turn |
| **Spectator mode** | Watch live games with slight delay |
| **Game state snapshots** | Fork a game state to explore alternative lines |
| **Statistics** | Win rate by leader, matchup data, play patterns |
| **Turn timer options** | Configurable per lobby (casual = generous, competitive = strict) |
| **Ranked matchmaking** | Built-in ELO/MMR system instead of relying on third-party Discord |

### 15.12 What to Avoid

Based on negative lessons from the case studies:

| Anti-Pattern | Lesson From | Description |
|-------------|-------------|-------------|
| Identical destructive/routine buttons | Catan Universe | End Turn must look and feel different from Pass Priority |
| Hidden features | Pokemon TCG | Every feature should be discoverable through the UI |
| No game log | OPTCG Sim | Players must be able to review what happened |
| Bland, static board | Pokemon TCG Live | The board should feel alive and immersive |
| Forced slow animations | All | Always provide speed controls |
| Desktop UI on mobile | OPTCG Sim | Mobile requires redesigned interactions, not just scaling |
| Manual rule enforcement | OPTCG Sim | A digital game should enforce its own rules |
| Flash-and-forget opponent plays | MTG Arena | Give players time and space to read opponent's actions |
| Overdecorated chrome | Catan Universe | UI chrome should recede; card art and game state are heroes |
| No undo for misclicks | OPTCG Sim | At minimum, provide undo for the current action before confirmation |

---

## Sources & References

### Primary Sources
- [Hearthstone GDC 2015: "How to Create an Immersive User Interface"](https://gdcvault.com/play/1022036/Hearthstone-How-to-Create-an)
- [Balatro Design Analysis: Visual Packaging and Interactive Feedback (Medium)](https://medium.com/@yyh19971004/balatro-design-analysis-visual-packaging-and-interactive-feedback-cc6fa6a65370)
- [OPTCG Sim Official Site](https://optcgsim.com/)
- [OPTCG Official Play Guide](https://en.onepiece-cardgame.com/play-guide/)
- [MTG Arena UX Redesign (Medium)](https://medium.com/@tempestfunk/i-was-given-a-design-challenge-to-do-a-redesign-of-the-ux-for-the-main-menu-hud-or-any-other-c8a9e84112)
- [MTG Arena In-Match Screen Guide (Hipsters of the Coast)](https://www.hipstersofthecoast.com/2018/03/how-to-play-mtg-arena-the-in-match-screen/)
- [We Put Battles on MTG Arena (Wizards)](https://magic.wizards.com/en/news/mtg-arena/we-put-battles-on-mtg-arena-what-was-that-like)
- [Pokemon TCG Pocket Design Critique (IXD@Pratt)](https://ixd.prattsi.org/2025/09/design-critique-pokemon-tcg-pocket-android-app/)
- [Yu-Gi-Oh Master Duel Duel Screen Guide](https://gameplay.tips/guides/yu-gi-oh-master-duel-duel-screen-info-guide-duel-field-menu-and-icons.html)
- [Deckbuilder UI Design Best Practices](https://www.gunslingersrevenge.com/posts/development/deckbuilder-ui-design-best-practices.html)
- [Slay the Spire War Stories (Ars Technica)](https://arstechnica.com/video/watch/war-stories-slay-the-spire-war-stories)
- [Catan Universe Redesign Critique (Medium)](https://alexandrinealla.medium.com/coping-with-redesign-catan-universe-19fb2a1fe728)
- [OPTCGSim Install Guide (One Piece Player)](https://onepieceplayer.com/play-one-piece-card-game-online-optcgsim/)
- [Hearthstone Immersive UI (Polygon)](https://www.polygon.com/2014/2/12/5404014/blizzard-devs-transmogrify-the-virtual-into-the-tangible-with)
- [Hearthstone Access (Community Mod)](https://hearthstoneaccess.github.io/)

### Secondary Sources
- [Legends of Runeterra UI Elements (Dribbble)](https://dribbble.com/shots/18750848-Legends-of-Runeterra-UI-Elements)
- [Card Game UI Physics (itch.io)](https://itch.io/blog/1325095/ui-physics-based-drag-drop-system-with-holographic-card-shaders-in-unity)
- [Mobile Game UX and Player Retention (EJAW)](https://ejaw.net/how-mobile-game-ux-interface-design-drives-player-retention-in-2026/)
- [MTG Arena Behance Overview](https://www.behance.net/gallery/129757113/Magic-The-Gathering-ARENA-UI-UX-Overview)
- [LJLambino OPTCG Sim Reviews](https://ljlambino.com/articles/1631/optcg-sim-1-23a-one-piece-major-enhancements-bug-fixes-and-new-cards/)
