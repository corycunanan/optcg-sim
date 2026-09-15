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

import { computeEffectAvailability } from "@engine/engine/availability";
import { injectSchemasIntoCardDb } from "@engine/engine/schema-registry";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
} from "@engine/__tests__/helpers";
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
  it.each([0, 1, 2])(
    "renders authored Dalton DON eligibility with %i attached DON",
    (count) => {
      const db = createTestCardDb();
      db.set("OP08-008", { ...CARDS.VANILLA, id: "OP08-008" });
      injectSchemasIntoCardDb(db);
      const state = createBattleReadyState(db);
      const source = state.players[0].characters[0]!;
      source.cardId = "OP08-008";
      source.attachedDon = Array.from({ length: count }, (_, i) => ({
        instanceId: `don-${i}`,
        state: "ACTIVE",
        attachedTo: source.instanceId,
      }));
      const onAction = vi.fn();
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <EffectAvailabilityProvider
            effectAvailability={computeEffectAvailability(state, db)}
          >
            <CardActionMenuContent
              card={source}
              cardDb={Object.fromEntries(db)}
              activation={null}
              canActivateNow={true}
              onAction={onAction}
              onClose={vi.fn()}
            />
          </EffectAvailabilityProvider>
        );
      });
      const [item] = actionItems(renderer);
      expect(item.props.disabled).toBe(count === 0);
      if (count > 0) {
        act(() => item.props.onClick());
        expect(onAction).toHaveBeenCalledWith({
          type: "ACTIVATE_EFFECT",
          cardInstanceId: source.instanceId,
          effectId: "activate_rush",
        });
      } else {
        expect(
          item.findAllByType("span").map((span) => span.children.join(""))
        ).toContain("condition not met");
        expect(onAction).not.toHaveBeenCalled();
      }
      act(() => renderer.unmount());
    }
  );

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

  it("fails compound triggers closed until usable and dispatches each rendered block id", () => {
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
                any_of: [{ keyword: "ON_PLAY" }, { keyword: "ACTIVATE_MAIN" }],
              },
            },
          ],
        },
      },
    } as unknown as CardDb;
    const onAction = vi.fn();

    const missingAvailabilityItems = actionItems(
      renderMenu(undefined, { cardDb: compoundCardDb, onAction })
    );
    expect(missingAvailabilityItems).toHaveLength(1);
    act(() => missingAvailabilityItems[0].props.onClick());
    expect(onAction).toHaveBeenLastCalledWith({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: "card-1",
      effectId: "activate-main-1",
    });

    const usableItems = actionItems(
      renderMenu(
        {
          "card-1": [{ effectId: "activate-main-2", status: "usable" }],
        },
        { cardDb: compoundCardDb, onAction }
      )
    );
    expect(usableItems).toHaveLength(2);
    expect(usableItems.every((item) => item.props.disabled === false)).toBe(
      true
    );

    act(() => usableItems[0].props.onClick());
    act(() => usableItems[1].props.onClick());
    expect(
      onAction.mock.calls.slice(-2).map(([action]) => action.effectId)
    ).toEqual(["activate-main-1", "activate-main-2"]);
  });
});
