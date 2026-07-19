# Component domains

`src/components/` contains 11 top-level feature domains. Put a component in the
narrowest domain that owns its behavior; use `ui/` only for reusable primitives.

| Folder          | Purpose                                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `admin/`        | Admin card browsing and card editing surfaces.                                                                                                                                                                           |
| `cards/`        | Public card/set browser, filters, pagination, galleries, and card details.                                                                                                                                               |
| `deck-builder/` | Deck editing shell, search/list panels, customization, import/export, stats, validation, and navigation guards.                                                                                                          |
| `game/`         | Live game presentation and interaction: board layout, cards, pregame prompts, overlays, modals, and event feedback. See [`game/scaled-board/README.md`](./game/scaled-board/README.md) for the scaled viewport boundary. |
| `home/`         | Home-page-only presentation.                                                                                                                                                                                             |
| `lobbies/`      | Lobby browser/room UI, pregame settings, invites, leave/close flows, and room recovery.                                                                                                                                  |
| `nav/`          | Global application navigation.                                                                                                                                                                                           |
| `realtime/`     | User-channel provider, connection state, and presence-facing UI adapters.                                                                                                                                                |
| `sandbox/`      | Animation sandbox shell, scenario runner, playback controls, and sandbox session adapters.                                                                                                                               |
| `social/`       | Social sidebar, chat, avatars, and reducers for friend/message events.                                                                                                                                                   |
| `ui/`           | Shared UI primitives and their Storybook stories; exported primitives are collected in `ui/index.ts`.                                                                                                                    |

Tests and stories stay beside the component or in a local `__tests__/` /
`__stories__/` directory. Design rules and the inside-board type/focus floor live
in [`docs/design/BRANDING-GUIDELINES.md`](../../docs/design/BRANDING-GUIDELINES.md).
