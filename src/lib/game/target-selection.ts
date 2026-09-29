import type {
  CardDb,
  CardInstance,
  DonInstance,
  PlayerState,
  SelectTargetPrompt,
} from "@shared/game-types";

type DualTargetSlot = {
  validIds: string[];
  countMin: number;
  countMax: number;
};

export interface TargetCardSelectionState {
  selected: boolean;
  eligible: boolean;
  disabledReason: string | null;
  /** The server offered this id (prompt `validTargets`). Unlike `eligible`,
   *  it does not change as the shared count fills. Always set by
   *  `buildTargetSelectionModel`; optional only for hand-built fixtures. */
  offered?: boolean;
}

export interface TargetSelectionModel {
  byId: Map<string, TargetCardSelectionState>;
  selectedCards: CardInstance[];
  /** Every selected id — field cards and cost-area DON!! — in display order.
   *  This is the SELECT_TARGET payload. */
  selectedIds: string[];
  selectedCount: number;
  countLabel: string;
  aggregateLabel: string | null;
  canConfirm: boolean;
}

function canAssignDualTargets(
  selectedIds: readonly string[],
  slots: readonly DualTargetSlot[],
  requireMinimums = true
): boolean {
  const counts = slots.map(() => 0);
  const validSets = slots.map((slot) => new Set(slot.validIds));

  function backtrack(index: number): boolean {
    if (index === selectedIds.length) {
      return (
        !requireMinimums ||
        slots.every((slot, slotIndex) => counts[slotIndex] >= slot.countMin)
      );
    }

    const id = selectedIds[index];
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      if (
        validSets[slotIndex].has(id) &&
        counts[slotIndex] < slots[slotIndex].countMax
      ) {
        counts[slotIndex]++;
        if (backtrack(index + 1)) return true;
        counts[slotIndex]--;
      }
    }
    return false;
  }

  return backtrack(0);
}

export function collectBattlefieldCards(
  me: PlayerState | null,
  opp: PlayerState | null
): CardInstance[] {
  const cards: CardInstance[] = [];
  const seen = new Set<string>();

  for (const player of [me, opp]) {
    if (!player) continue;
    for (const card of [player.leader, ...player.characters, player.stage]) {
      if (!card || seen.has(card.instanceId)) continue;
      seen.add(card.instanceId);
      cards.push(card);
    }
  }

  return cards;
}

/** Cost-area DON!! of both players. DON!! given to a card is not a separate
 *  target and stays out of this list. */
export function collectBattlefieldDon(
  me: PlayerState | null,
  opp: PlayerState | null
): DonInstance[] {
  return [me, opp].flatMap((player) => player?.donCostArea ?? []);
}

/**
 * The server's valid ids that name a cost-area DON!! rather than a card.
 * SELECT_TARGET `cards` only carries CardInstances, so a mixed pool (OPT-792)
 * reaches the client as DON!! ids in `validTargets` alone.
 */
function donTargetIds(
  prompt: SelectTargetPrompt,
  battlefieldDon: readonly DonInstance[]
): Set<string> {
  const donIds = new Set(battlefieldDon.map((don) => don.instanceId));
  return new Set(prompt.validTargets.filter((id) => donIds.has(id)));
}

export function isBattlefieldTargetPrompt(
  prompt: SelectTargetPrompt,
  battlefieldCards: readonly CardInstance[],
  battlefieldDon: readonly DonInstance[] = []
): boolean {
  if (prompt.blindSelection) return false;
  if (
    prompt.cards.length === 0 &&
    donTargetIds(prompt, battlefieldDon).size === 0
  ) {
    return false;
  }
  const battlefieldIds = new Set(
    battlefieldCards.map((card) => card.instanceId)
  );
  return prompt.cards.every((card) => battlefieldIds.has(card.instanceId));
}

/**
 * Stable identity for local target-selection state. Every constraint that can
 * change which cards are legal participates so a new server prompt cannot
 * inherit selections from a superficially similar previous prompt.
 */
export function selectTargetPromptKey(prompt: SelectTargetPrompt): string {
  return JSON.stringify({
    cards: prompt.cards.map((card) => card.instanceId),
    validTargets: prompt.validTargets,
    effectDescription: prompt.effectDescription,
    countMin: prompt.countMin,
    countMax: prompt.countMax,
    ctaLabel: prompt.ctaLabel,
    blindSelection: prompt.blindSelection ?? false,
    aggregateConstraint: prompt.aggregateConstraint ?? null,
    uniquenessConstraint: prompt.uniquenessConstraint ?? null,
    namedDistribution: prompt.namedDistribution ?? null,
    dualTargets: prompt.dualTargets ?? null,
  });
}

function countLabel(prompt: SelectTargetPrompt): string {
  if (prompt.countMin === prompt.countMax) return `Select ${prompt.countMin}`;
  if (prompt.countMin === 0) return `Select up to ${prompt.countMax}`;
  return `Select ${prompt.countMin}\u2013${prompt.countMax}`;
}

export function buildTargetSelectionModel(
  prompt: SelectTargetPrompt,
  selectedIds: ReadonlySet<string>,
  cardDb: CardDb,
  displayCards: readonly CardInstance[] = prompt.cards,
  displayDon: readonly DonInstance[] = []
): TargetSelectionModel {
  const validSet = new Set(prompt.validTargets);
  const selectedCards = prompt.cards.filter((card) =>
    selectedIds.has(card.instanceId)
  );
  // DON!! participate only when the server offered at least one of them;
  // eligibility is exactly the server's valid ids, never recomputed here.
  const selectableDon = donTargetIds(prompt, displayDon).size > 0
    ? displayDon
    : [];
  const selectedDonIds = selectableDon
    .filter((don) => selectedIds.has(don.instanceId))
    .map((don) => don.instanceId);
  const selectedIdList = [
    ...selectedCards.map((card) => card.instanceId),
    ...selectedDonIds,
  ];
  const selectedCount = selectedIdList.length;

  const aggregateSum = prompt.aggregateConstraint
    ? selectedCards.reduce((sum, card) => {
        const value =
          cardDb[card.cardId]?.[prompt.aggregateConstraint!.property];
        return sum + (value ?? 0);
      }, 0)
    : 0;

  const takenNames = new Set<string>();
  const takenColors = new Set<string>();
  const takenDistributionNames = new Set<string>();
  for (const card of selectedCards) {
    const data = cardDb[card.cardId];
    if (!data) continue;
    takenNames.add(data.name);
    for (const color of data.color) takenColors.add(color);
    takenDistributionNames.add(data.name);
  }

  function sharedReason(instanceId: string): string | null | undefined {
    if (selectedIds.has(instanceId)) return null;
    if (!validSet.has(instanceId)) return "Not a valid target";
    if (selectedCount >= prompt.countMax) return "Selection limit reached";
    return undefined;
  }

  function dualTargetReason(instanceId: string): string | null {
    if (
      prompt.dualTargets &&
      !canAssignDualTargets(
        [...selectedIdList, instanceId],
        prompt.dualTargets.slots,
        false
      )
    ) {
      return "No valid slot assignment with this card";
    }
    return null;
  }

  function disabledReason(card: CardInstance): string | null {
    const shared = sharedReason(card.instanceId);
    if (shared !== undefined) return shared;

    const data = cardDb[card.cardId];
    if (!data) return null;

    if (prompt.aggregateConstraint) {
      const value = data[prompt.aggregateConstraint.property] ?? 0;
      const next = aggregateSum + value;
      if (
        (prompt.aggregateConstraint.operator === "<=" ||
          prompt.aggregateConstraint.operator === "==") &&
        next > prompt.aggregateConstraint.value
      ) {
        return `Adding this would exceed ${prompt.aggregateConstraint.value} ${prompt.aggregateConstraint.property}`;
      }
    }

    if (
      prompt.uniquenessConstraint?.field === "name" &&
      takenNames.has(data.name)
    ) {
      return `Already selected a card named "${data.name}"`;
    }
    if (
      prompt.uniquenessConstraint?.field === "color" &&
      data.color.some((color) => takenColors.has(color))
    ) {
      return "Already selected a card of this color";
    }

    if (prompt.namedDistribution && takenDistributionNames.has(data.name)) {
      return `Only one "${data.name}" allowed`;
    }

    return dualTargetReason(card.instanceId);
  }

  const byId = new Map<string, TargetCardSelectionState>();
  for (const card of displayCards) {
    const selected = selectedIds.has(card.instanceId);
    const reason = disabledReason(card);
    byId.set(card.instanceId, {
      selected,
      eligible: !selected && reason === null,
      disabledReason: reason,
      offered: validSet.has(card.instanceId),
    });
  }
  for (const don of selectableDon) {
    const selected = selectedIds.has(don.instanceId);
    const shared = sharedReason(don.instanceId);
    const reason =
      shared !== undefined ? shared : dualTargetReason(don.instanceId);
    byId.set(don.instanceId, {
      selected,
      eligible: !selected && reason === null,
      disabledReason: reason,
      offered: validSet.has(don.instanceId),
    });
  }

  let aggregateOk = true;
  if (prompt.aggregateConstraint) {
    const { operator, value } = prompt.aggregateConstraint;
    if (operator === "<=") aggregateOk = aggregateSum <= value;
    else if (operator === ">=") aggregateOk = aggregateSum >= value;
    else aggregateOk = aggregateSum === value;
  }

  const dualTargetsOk = prompt.dualTargets
    ? canAssignDualTargets(selectedIdList, prompt.dualTargets.slots)
    : true;
  const selectionIsValid = selectedIdList.every((id) => validSet.has(id));
  const withinCount =
    selectedCount >= prompt.countMin && selectedCount <= prompt.countMax;

  return {
    byId,
    selectedCards,
    selectedIds: selectedIdList,
    selectedCount,
    countLabel: countLabel(prompt),
    aggregateLabel: prompt.aggregateConstraint
      ? `Total ${prompt.aggregateConstraint.property}: ${aggregateSum} ${prompt.aggregateConstraint.operator} ${prompt.aggregateConstraint.value}`
      : null,
    canConfirm: selectionIsValid && withinCount && aggregateOk && dualTargetsOk,
  };
}
