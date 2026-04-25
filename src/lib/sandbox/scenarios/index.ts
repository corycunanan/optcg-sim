// Sandbox scenario manifest. Scenarios are appended here; the hub
// (`/sandbox`) and the player route (`/sandbox/[scenarioId]`) both read this
// array. Adding a scenario is a one-line registration here plus a new file
// under `scenarios/<category>/`.

import type { Scenario } from "./types";
import { drawOneScenario } from "./draws/draw-1";
import { drawTwoScenario } from "./draws/draw-2";
import { peekTopThreeScenario } from "./draws/peek-top-3";
import { attachOneDonScenario } from "./movement/attach-1-don";
import { attachThreeDonStaggeredScenario } from "./movement/attach-3-don-staggered";
import { playCharacterSummonScenario } from "./movement/play-character-summon";
import { redistributeDonScenario } from "./movement/redistribute-don";
import { selectTargetScenario } from "./prompts/select-target";

export const scenarios: Scenario[] = [
  drawOneScenario,
  drawTwoScenario,
  peekTopThreeScenario,
  playCharacterSummonScenario,
  attachOneDonScenario,
  attachThreeDonStaggeredScenario,
  redistributeDonScenario,
  selectTargetScenario,
];

export type {
  ExpectedResponse,
  PartialGameState,
  PartialPlayerState,
  Scenario,
  ScenarioCategory,
  ScenarioStep,
} from "./types";

export {
  makeCard,
  makeDonStack,
  makeLifeStack,
  playerSlot,
  type MakeCardInput,
  type MakeDonStackInput,
  type MakeLifeStackInput,
  type PlayerSlotInput,
} from "./helpers";
