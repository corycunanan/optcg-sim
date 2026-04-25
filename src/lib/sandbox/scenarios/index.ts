// Sandbox scenario manifest. Scenarios are appended here; the hub
// (`/sandbox`) and the player route (`/sandbox/[scenarioId]`) both read this
// array. Adding a scenario is a one-line registration here plus a new file
// under `scenarios/<category>/`.

import type { Scenario } from "./types";
import { drawTwoScenario } from "./draws/draw-2";
import { selectTargetScenario } from "./prompts/select-target";

export const scenarios: Scenario[] = [drawTwoScenario, selectTargetScenario];

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
