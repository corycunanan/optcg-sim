import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EffectAvailability } from "@shared/game-types";
import {
  EffectAvailabilityProvider,
  useEffectAvailability,
} from "./effect-availability-context";

function AvailabilityProbe({
  instanceId,
  effectId,
}: {
  instanceId: string;
  effectId: string;
}) {
  const { getCardAvailability, getEffectStatus, hasUsableEffect } =
    useEffectAvailability();
  const entries = getCardAvailability(instanceId);
  const status = getEffectStatus(instanceId, effectId);

  return (
    <span>{`${entries.length}:${status?.status ?? "neutral"}:${hasUsableEffect(instanceId)}`}</span>
  );
}

describe("EffectAvailabilityProvider", () => {
  const availability: Record<string, EffectAvailability[]> = {
    "card-1": [
      { effectId: "on-play", status: "used" },
      { effectId: "activate-main", status: "usable" },
    ],
    "card-2": [
      { effectId: "activate-main", status: "blocked", reason: "COST" },
    ],
  };

  it("returns entries and block status for a known card instance", () => {
    const markup = renderToStaticMarkup(
      <EffectAvailabilityProvider effectAvailability={availability}>
        <AvailabilityProbe instanceId="card-1" effectId="on-play" />
      </EffectAvailabilityProvider>
    );

    expect(markup).toBe("<span>2:used:true</span>");
  });

  it("returns neutral fallbacks for an unknown card instance", () => {
    const markup = renderToStaticMarkup(
      <EffectAvailabilityProvider effectAvailability={availability}>
        <AvailabilityProbe
          instanceId="unknown-card"
          effectId="missing-effect"
        />
      </EffectAvailabilityProvider>
    );

    expect(markup).toBe("<span>0:neutral:false</span>");
  });

  it("returns neutral fallbacks when availability is undefined", () => {
    const markup = renderToStaticMarkup(
      <EffectAvailabilityProvider effectAvailability={undefined}>
        <AvailabilityProbe instanceId="card-1" effectId="activate-main" />
      </EffectAvailabilityProvider>
    );

    expect(markup).toBe("<span>0:neutral:false</span>");
  });

  it("reports false when a card has entries but none are usable", () => {
    const markup = renderToStaticMarkup(
      <EffectAvailabilityProvider effectAvailability={availability}>
        <AvailabilityProbe instanceId="card-2" effectId="activate-main" />
      </EffectAvailabilityProvider>
    );

    expect(markup).toBe("<span>1:blocked:false</span>");
  });

  it("returns neutral fallbacks outside the provider", () => {
    expect(
      renderToStaticMarkup(
        <AvailabilityProbe instanceId="card-1" effectId="activate-main" />
      )
    ).toBe("<span>0:neutral:false</span>");
  });
});
