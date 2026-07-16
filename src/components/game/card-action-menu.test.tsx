import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type {
  CardDb,
  CardInstance,
  EffectAvailability,
  GameAction,
} from "@shared/game-types";
import { EffectAvailabilityProvider } from "@/contexts/effect-availability-context";

vi.mock("@/components/ui", () => {
  const Wrapper = ({ children }: PropsWithChildren) => <>{children}</>;
  return {
    DropdownMenuContent: Wrapper,
    DropdownMenuLabel: Wrapper,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuItem: ({
      children,
      ...props
    }: ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
  };
});

import { CardActionMenuContent } from "./card-action-menu";

const card = {
  instanceId: "card-1",
  cardId: "TEST-001",
} as CardInstance;

const cardDb = {
  "TEST-001": {
    name: "Test Card",
    type: "CHARACTER",
    effectSchema: {
      effects: [
        {
          id: "activate-main-1",
          category: "activate",
          trigger: { keyword: "ACTIVATE_MAIN" },
        },
      ],
    },
  },
} as unknown as CardDb;

function renderMenu(
  effectAvailability: Record<string, EffectAvailability[]> | undefined,
  overrides: { cardDb?: CardDb; onAction?: (action: GameAction) => void } = {}
) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <EffectAvailabilityProvider effectAvailability={effectAvailability}>
        <CardActionMenuContent
          card={card}
          cardDb={overrides.cardDb ?? cardDb}
          activation={null}
          canActivateNow={false}
          onAction={overrides.onAction ?? vi.fn()}
          onClose={vi.fn()}
        />
      </EffectAvailabilityProvider>
    );
  });
  return renderer;
}

function actionItems(renderer: ReactTestRenderer) {
  return renderer.root.findAllByType("button");
}

describe("CardActionMenuContent", () => {
  it("enables and dispatches an available Activate Main effect", () => {
    const onAction = vi.fn();
    const renderer = renderMenu(
      {
        "card-1": [{ effectId: "activate-main-1", status: "usable" }],
      },
      { onAction }
    );
    const [item] = actionItems(renderer);

    expect(item.props.disabled).toBe(false);
    act(() => item.props.onClick());
    expect(onAction).toHaveBeenCalledWith({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: "card-1",
      effectId: "activate-main-1",
    });
  });

  it("disables a cost-blocked effect and renders the shared reason copy", () => {
    const renderer = renderMenu({
      "card-1": [
        { effectId: "activate-main-1", status: "blocked", reason: "COST" },
      ],
    });
    const [item] = actionItems(renderer);

    expect(item.props.disabled).toBe(true);
    expect(
      item.findAllByType("span").map((span) => span.children.join(""))
    ).toContain("cost unavailable");
  });

  it("fails open when the server sent no availability entry", () => {
    const [item] = actionItems(renderMenu(undefined));

    expect(item.props.disabled).toBe(false);
  });

  it("renders every Activate Main block, including compound triggers", () => {
    const compoundCardDb = {
      "TEST-001": {
        ...cardDb["TEST-001"],
        effectSchema: {
          effects: [
            {
              id: "activate-main-1",
              category: "activate",
              trigger: { keyword: "ACTIVATE_MAIN" },
            },
            {
              id: "activate-main-2",
              category: "activate",
              trigger: {
                any_of: [
                  { keyword: "ON_PLAY" },
                  { keyword: "ACTIVATE_MAIN" },
                ],
              },
            },
          ],
        },
      },
    } as unknown as CardDb;

    expect(
      actionItems(renderMenu(undefined, { cardDb: compoundCardDb }))
    ).toHaveLength(2);
  });
});
