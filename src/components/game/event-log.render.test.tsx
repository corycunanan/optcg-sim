// @vitest-environment jsdom
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardDb } from "@shared/game-types";
import { EventLogLine } from "./event-log";

vi.mock("./use-card-tooltip", () => ({
  CardTooltip: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="card-tooltip">{children}</span>
  ),
}));

const cardDb = { "OP01-025": { name: "Roronoa Zoro" } } as unknown as CardDb;

let renderer: ReactTestRenderer | null = null;
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("EventLogLine", () => {
  it("sets notation as an effect chip and the card name as an underlined tooltip trigger", () => {
    act(() => {
      renderer = create(
        <EventLogLine
          cardDb={cardDb}
          entry={{
            text: "[Trigger] You activated Roronoa Zoro",
            parts: [
              { kind: "text", text: "[Trigger] " },
              { kind: "text", text: "You activated " },
              { kind: "card", cardId: "OP01-025", name: "Roronoa Zoro" },
            ],
          }}
        />
      );
    });
    const root = renderer!.root;
    const chip = root.findByProps({ "data-effect-notation": "trigger" });
    expect(chip.props.children).toBe("Trigger");
    const name = root.findByProps({ "data-event-log-card": "OP01-025" });
    expect(name.props.className).toContain("underline");
    expect(name.props.children).toBe("Roronoa Zoro");
    expect(root.findAllByProps({ "data-testid": "card-tooltip" })).toHaveLength(1);
  });
});
