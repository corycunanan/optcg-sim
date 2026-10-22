/** Non-authoritative frontend preview only. Does not emit server state, exercise
 * cost payment, or count as an actual-writer compatibility capture. */
import type { PlayerChoicePrompt } from "@shared/game-types";
import type { Scenario } from "../types";
import { playerChoiceThreeOptionsScenario as base } from "./player-choice-3-options";

const groups = [
  { donIds: ["p0-don-1", "p0-don-2"], label: "Rested DON!! in cost area" },
  { donIds: ["p0-don-3"], label: "Rested in cost area — Cannot become active from Player 2 Komachiyo (Character slot 1) (through its next refresh)" },
  { donIds: ["p0-don-4"], label: "Attached to Roronoa Zoro (Leader)" },
];
const plans = [
  [1, 0, 0], [0, 1, 0], [0, 0, 1],
  [2, 0, 0], [1, 1, 0], [1, 0, 1], [0, 1, 1],
  [2, 1, 0], [2, 0, 1], [1, 1, 1], [2, 1, 1],
];
function scenario(variable: boolean): Scenario {
  const initialState = structuredClone(base.initialState);
  const player = initialState.players![0]!;
  if (player.leader && player.donCostArea) {
    const attached = player.donCostArea.pop()!;
    player.leader.attachedDon = [{ ...attached, attachedTo: player.leader.instanceId }];
    player.donCostArea = player.donCostArea.map(d => ({ ...d, state: "RESTED" }));
  }
  const choices = plans.filter(plan => variable || plan.reduce((sum, n) => sum + n, 0) === 2).map(plan => ({
    id: `don-return-ids:${JSON.stringify(groups.flatMap((group, index) => group.donIds.slice(0, plan[index])))}`,
    label: `Return ${plan.flatMap((n, index) => n ? [`${n} ${groups[index].label}`] : []).join(" + ")}`,
  }));
  const prompt: PlayerChoicePrompt = {
    promptType: "PLAYER_CHOICE",
    effectDescription: variable ? "Return 1 or more DON!! cards from your field to your DON!! deck." : "Return 2 DON!! cards from your field to your DON!! deck.",
    choices,
    donIdentityReturn: { countMin: variable ? 1 : 2, countMax: variable ? 4 : 2, groups },
  };
  return {
    ...base, initialState, cardsUsed: [...base.cardsUsed, "OP01-010"],
    id: variable ? "don-identity-variable" : "don-identity-fixed",
    title: variable ? "DON!! identity picker (variable)" : "DON!! identity picker (fixed)",
    description: "Frontend preview: choose free, held or attached DON!! using keyboard-accessible controls. The server choices remain a fallback for older clients.",
    script: [{ type: "prompt", prompt }],
    expectedResponse: {
      allowedActionTypes: ["PLAYER_CHOICE"],
      predicate: action => action.type === "PLAYER_CHOICE" && choices.some(choice => choice.id === action.choiceId),
      hint: "Choose DON!! groups, then confirm an offered payment",
    },
  };
}
export const donIdentityFixedScenario = scenario(false);
export const donIdentityVariableScenario = scenario(true);


const longGroups = Array.from({ length: 10 }, (_, index) => ({
  donIds: [`preview-don-${index + 1}`],
  label: index < 2 ? `Rested in cost area — Cannot become active from Player 2 Komachiyo (Character slot 1) (${index ? "this turn" : "through its next refresh"})`
    : `Attached to Roronoa Zoro (Character slot ${index - 1}) — choose this group to remove that card’s power bonus`,
}));
const longChoices = longGroups.flatMap((first, index) => longGroups.slice(index + 1).map(second => ({
  id: `don-return-ids:${JSON.stringify([...first.donIds, ...second.donIds])}`,
  label: `Return ${first.label} + ${second.label}`,
})));
export const donIdentityLongLabelsScenario: Scenario = {
  ...donIdentityFixedScenario,
  id: "don-identity-long-labels",
  title: "DON!! identity picker (10 groups, long labels)",
  description: "Non-authoritative layout stress fixture: 10 groups and long labels to inspect scrolling, keyboard focus and a reachable footer at a small viewport.",
  script: [{ type: "prompt", prompt: {
    promptType: "PLAYER_CHOICE", effectDescription: "Return 2 DON!! cards from your field to your DON!! deck.",
    choices: longChoices, donIdentityReturn: { countMin: 2, countMax: 2, groups: longGroups },
  } }],
  expectedResponse: { allowedActionTypes: ["PLAYER_CHOICE"], predicate: action => action.type === "PLAYER_CHOICE" && longChoices.some(c => c.id === action.choiceId), hint: "Choose two groups, then confirm" },
};

/** Legal duplicate-name board; metadata is frontend-only, no server writer claim. */
const duplicateInitial = structuredClone(base.initialState);
const duplicatePlayer = duplicateInitial.players![0]!;
const duplicateDons = duplicatePlayer.donCostArea;
duplicatePlayer.donCostArea = duplicateDons.slice(0, 2).map(d => ({ ...d, state: "RESTED" }));
duplicatePlayer.characters = [
  ...[0, 1].map(index => ({
    ...structuredClone(duplicatePlayer.leader), instanceId: `preview-zoro-${index + 1}`,
    cardId: "OP01-025", zone: "CHARACTER" as const,
    attachedDon: [{ ...duplicateDons[index + 2], attachedTo: `preview-zoro-${index + 1}` }],
  })),
  null, null, null,
];
const duplicateGroups = [
  { donIds: [duplicateDons[0].instanceId], label: "Rested in cost area — Cannot become active from Player 2 Komachiyo (Character slot 1) (through its next refresh)" },
  { donIds: [duplicateDons[1].instanceId], label: "Rested in cost area — Cannot become active from Player 2 Komachiyo (Character slot 1) (this turn)" },
  ...[0, 1].map(index => ({ donIds: [duplicateDons[index + 2].instanceId], label: `Attached to Roronoa Zoro (Character slot ${index + 1})` })),
];
const duplicateChoices = duplicateGroups.flatMap((first, index) => duplicateGroups.slice(index + 1).map(second => ({ id: `don-return-ids:${JSON.stringify([...first.donIds, ...second.donIds])}`, label: `Return 1 ${first.label} + 1 ${second.label} DON!!` })));
export const donIdentityDuplicateHostsScenario: Scenario = {
  ...donIdentityFixedScenario, initialState: duplicateInitial, cardsUsed: [...base.cardsUsed, "OP01-025", "OP01-010"],
  id: "don-identity-duplicate-hosts", title: "DON!! picker (duplicate hosts and distinct holds)",
  description: "Frontend preview with explicitly synthetic holds from the bundled Komachiyo: distinguish duplicate Characters by board slot and holds by source/duration. No server compatibility claim.",
  script: [{ type: "prompt", prompt: { promptType: "PLAYER_CHOICE", effectDescription: "Return 2 DON!! cards from your field to your DON!! deck.", choices: duplicateChoices, donIdentityReturn: { countMin: 2, countMax: 2, groups: duplicateGroups } } }],
  expectedResponse: { allowedActionTypes: ["PLAYER_CHOICE"], predicate: action => action.type === "PLAYER_CHOICE" && duplicateChoices.some(c => c.id === action.choiceId), hint: "Choose two groups, then confirm" },
};

export const donIdentityDuplicateFallbackScenario: Scenario = {
  ...donIdentityDuplicateHostsScenario,
  id: "don-identity-duplicate-fallback", title: "DON!! generic fallback (duplicate hosts and holds)",
  description: "Frontend-only old-client fallback preview with explicitly synthetic holds: readable offered choices without optional picker metadata.",
  script: [{ type: "prompt", prompt: { promptType: "PLAYER_CHOICE", effectDescription: "Return 2 DON!! cards from your field to your DON!! deck.", choices: duplicateChoices } }],
};
