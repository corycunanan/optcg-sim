import type { SharedTargetFilter } from "./target-filter";

export type BlockerRelevantProhibitionType =
  | "CANNOT_ACTIVATE_BLOCKER"
  | "CANNOT_BE_RESTED"
  | "CANNOT_BLOCK"
  | "CANNOT_USE_BLOCKER";

export interface BlockerProhibitionTarget {
  type?: string;
  controller?: string;
  filter?: SharedTargetFilter;
}

export interface BlockerProhibition {
  sourceCardInstanceId?: string;
  prohibitionType: string;
  controller: 0 | 1;
  appliesTo?: readonly string[];
  target?: BlockerProhibitionTarget;
  scope?: {
    controller?: string;
    filter?: SharedTargetFilter;
  };
  usesRemaining?: number | null;
}

export interface BlockerCandidate {
  instanceId: string;
  controller: 0 | 1;
  cardType: string;
}

export interface BlockerProhibitionServices {
  matchesFilter(filter: SharedTargetFilter): boolean;
}

const CARD_LEVEL_BLOCKER_PROHIBITIONS = new Set<string>([
  "CANNOT_ACTIVATE_BLOCKER",
  "CANNOT_BE_RESTED",
  "CANNOT_BLOCK",
]);

function matchesController(
  prohibitionController: 0 | 1,
  actingPlayerIndex: 0 | 1,
  scopeController?: string,
): boolean {
  if (!scopeController) return true;
  if (scopeController === "SELF") {
    return prohibitionController === actingPlayerIndex;
  }
  if (scopeController === "OPPONENT") {
    return prohibitionController !== actingPlayerIndex;
  }
  return true;
}

function targetMatchesCandidate(
  prohibition: BlockerProhibition,
  candidate: BlockerCandidate,
  services: BlockerProhibitionServices,
): boolean {
  const target = prohibition.target;
  if (!target) return false;

  const targetType = target.type?.toUpperCase();
  if (
    targetType === "SELF" &&
    candidate.instanceId !== prohibition.sourceCardInstanceId
  ) {
    return false;
  }

  const controller =
    target.controller ??
    (targetType === "ALL_YOUR_CHARACTERS" || targetType === "YOUR_LEADER"
      ? "SELF"
      : targetType === "ALL_OPPONENT_CHARACTERS" ||
          targetType === "OPPONENT_LEADER"
        ? "OPPONENT"
        : undefined);
  if (controller === "SELF" && candidate.controller !== prohibition.controller) {
    return false;
  }
  if (
    controller === "OPPONENT" &&
    candidate.controller === prohibition.controller
  ) {
    return false;
  }

  if (
    targetType === "CHARACTER" ||
    targetType === "ALL_YOUR_CHARACTERS" ||
    targetType === "ALL_OPPONENT_CHARACTERS" ||
    targetType === "ALL_CHARACTERS"
  ) {
    if (candidate.cardType.toUpperCase() !== "CHARACTER") return false;
  } else if (
    targetType === "LEADER" ||
    targetType === "YOUR_LEADER" ||
    targetType === "OPPONENT_LEADER"
  ) {
    if (candidate.cardType.toUpperCase() !== "LEADER") return false;
  }

  return !target.filter || services.matchesFilter(target.filter);
}

function coversCandidate(
  prohibition: BlockerProhibition,
  candidate: BlockerCandidate,
  services: BlockerProhibitionServices,
): boolean {
  if (prohibition.appliesTo && prohibition.appliesTo.length > 0) {
    return prohibition.appliesTo.includes(candidate.instanceId);
  }
  if (prohibition.target) {
    return targetMatchesCandidate(prohibition, candidate, services);
  }
  if (prohibition.scope?.filter) {
    return services.matchesFilter(prohibition.scope.filter);
  }
  return true;
}

/** Return whether an active runtime prohibition vetoes DECLARE_BLOCKER. */
export function isBlockerProhibited(
  prohibitions: ReadonlyArray<BlockerProhibition>,
  candidate: BlockerCandidate,
  actingPlayerIndex: 0 | 1,
  services: BlockerProhibitionServices,
): boolean {
  for (const prohibition of prohibitions) {
    if (
      prohibition.usesRemaining !== null &&
      prohibition.usesRemaining !== undefined &&
      prohibition.usesRemaining <= 0
    ) {
      continue;
    }

    if (prohibition.prohibitionType === "CANNOT_USE_BLOCKER") {
      if (
        matchesController(
          prohibition.controller,
          actingPlayerIndex,
          prohibition.scope?.controller,
        )
      ) {
        return true;
      }
      continue;
    }

    if (!CARD_LEVEL_BLOCKER_PROHIBITIONS.has(prohibition.prohibitionType)) {
      continue;
    }
    if (
      prohibition.prohibitionType !== "CANNOT_BE_RESTED" &&
      !matchesController(
        prohibition.controller,
        actingPlayerIndex,
        prohibition.scope?.controller,
      )
    ) {
      continue;
    }
    if (coversCandidate(prohibition, candidate, services)) return true;
  }

  return false;
}
