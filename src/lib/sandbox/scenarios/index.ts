// Sandbox scenario manifest. Scenarios are appended in OPT-292 onward;
// this file ships the empty array + barrel re-exports so consumers can
// import everything from one path.

import type { Scenario } from "./types";

export const scenarios: Scenario[] = [];

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
