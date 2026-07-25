import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardDb, CardInstance } from "@shared/game-types";
import { InteractionModeProvider } from "./interaction-mode";

const { useSortable } = vi.hoisted(() => ({
  useSortable: vi.fn(() => ({
    attributes: { tabIndex: 0, "aria-describedby": "dnd-help" },
    listeners: { onKeyDown: vi.fn() },
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
}));

vi.mock("@dnd-kit/sortable", () => ({
  horizontalListSortingStrategy: {},
  SortableContext: ({ children }: { children: React.ReactNode }) => children,
  useSortable,
}));
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  useReducedMotion: () => true,
}));
vi.mock("@/contexts/active-effects-context", () => ({
  useActiveEffects: () => [],
}));
vi.mock("@/contexts/zone-position-context", () => ({
  useZonePosition: () => ({ register: vi.fn(), unregister: vi.fn() }),
}));
vi.mock("../card", () => ({
  Card: ({ data }: { data: { card?: CardInstance } }) => (
    <div data-testid={`card-${data.card?.instanceId ?? "unknown"}`} />
  ),
}));
vi.mock("./action-feedback", () => ({
  useCardRejection: () => null,
}));

import { HandLayer } from "./hand-layer";

const card = {
  instanceId: "hand-1",
  cardId: "TEST-001",
  zone: "HAND",
  state: "ACTIVE",
  attachedDon: [],
  turnPlayed: null,
  controller: 0,
  owner: 0,
} as CardInstance;

let renderer: ReactTestRenderer | null = null;

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  useSortable.mockClear();
});

describe("HandLayer spectator interaction", () => {
  it("renders face-up spectator cards without pointer or keyboard affordances", () => {
    act(() => {
      renderer = create(
        <InteractionModeProvider value="spectator">
          <HandLayer cards={[card]} cardDb={{} as CardDb} />
        </InteractionModeProvider>
      );
    });

    expect(renderer!.root.findAllByProps({ role: "button" })).toHaveLength(0);
    expect(renderer!.root.findAllByProps({ tabIndex: 0 })).toHaveLength(0);
    expect(useSortable).not.toHaveBeenCalled();
  });
});
