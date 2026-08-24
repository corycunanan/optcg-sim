import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActiveEffect } from "@shared/game-types";
import {
  ActiveEffectsProvider,
  computeEffectivePower,
  getPowerModDirection,
  useActiveEffects,
} from "./active-effects-context";

function AffordabilityProbe() {
  const effects = useActiveEffects();
  return <span>{effects.length}</span>;
}

describe("ActiveEffectsProvider", () => {
  it("preserves dynamic modifiers while applying unrelated numeric cost modifiers", () => {
    const effects = [
      {
        id: "eb01-027-per-count",
        sourceCardInstanceId: "source-1",
        appliesTo: ["hand-card"],
        modifiers: [
          {
            type: "MODIFY_POWER",
            params: {
              amount: {
                type: "PER_COUNT",
                source: "CHARACTERS_ON_FIELD",
                multiplier: 1000,
              },
            },
          },
        ],
      },
      { id: 42, sourceCardInstanceId: "malformed" },
      {
        id: "numeric-cost-reduction",
        sourceCardInstanceId: "source-2",
        appliesTo: ["hand-card"],
        modifiers: [
          { type: 7 },
          { type: "MODIFY_COST", params: { amount: -2 } },
        ],
      },
    ] as unknown as ActiveEffect[];

    const markup = renderToStaticMarkup(
      <ActiveEffectsProvider value={effects}>
        <AffordabilityProbe />
      </ActiveEffectsProvider>
    );

    expect(markup).toBe("<span>2</span>");
  });

  it("keeps client power helpers available for legacy snapshots", () => {
    const effects = [
      {
        id: "legacy-power-buff",
        sourceCardInstanceId: "source-1",
        appliesTo: ["field-card"],
        modifiers: [{ type: "MODIFY_POWER", params: { amount: 2000 } }],
      },
    ];

    expect(computeEffectivePower(effects, "field-card", 1000, 1)).toBe(4000);
    expect(getPowerModDirection(effects, "field-card", 1000)).toBe("up");
  });
});
