// Sandbox scenario manifest. Scenarios are appended here; the hub
// (`/sandbox`) and the player route (`/sandbox/[scenarioId]`) both read this
// array. Adding a scenario is a one-line registration here plus a new file
// under `scenarios/<category>/`.

import type { Scenario } from "./types";
import { attackNoBlockerScenario } from "./combat/attack-no-blocker";
import { blockerInterceptsScenario } from "./combat/blocker-intercepts";
import { counterFromHandScenario } from "./combat/counter-from-hand";
import { doubleAttackVsLifeScenario } from "./combat/double-attack-vs-life";
import { rushAttackScenario } from "./combat/rush-attack";
import { drawOneScenario } from "./draws/draw-1";
import { drawTwoScenario } from "./draws/draw-2";
import { peekTopThreeScenario } from "./draws/peek-top-3";
import { characterKoedByDamageScenario } from "./ko/character-koed-by-damage";
import { characterKoedByEffectScenario } from "./ko/character-koed-by-effect";
import { lifeToHandScenario } from "./life/life-to-hand";
import { lifeToTrashScenario } from "./life/life-to-trash";
import { attachOneDonScenario } from "./movement/attach-1-don";
import { attachThreeDonStaggeredScenario } from "./movement/attach-3-don-staggered";
import { playCharacterSummonScenario } from "./movement/play-character-summon";
import { redistributeDonScenario } from "./movement/redistribute-don";
import { playCharacterScenario } from "./playground/play-character";
import { arrangeTopFourScenario } from "./prompts/arrange-top-4";
import { optionalEffectScenario } from "./prompts/optional-effect";
import { playerChoiceThreeOptionsScenario } from "./prompts/player-choice-3-options";
import { revealTriggerScenario } from "./prompts/reveal-trigger";
import { selectTargetScenario } from "./prompts/select-target";

export const scenarios: Scenario[] = [
  playCharacterScenario,
  drawOneScenario,
  drawTwoScenario,
  peekTopThreeScenario,
  playCharacterSummonScenario,
  attachOneDonScenario,
  attachThreeDonStaggeredScenario,
  redistributeDonScenario,
  attackNoBlockerScenario,
  blockerInterceptsScenario,
  counterFromHandScenario,
  doubleAttackVsLifeScenario,
  rushAttackScenario,
  characterKoedByDamageScenario,
  characterKoedByEffectScenario,
  lifeToHandScenario,
  lifeToTrashScenario,
  selectTargetScenario,
  arrangeTopFourScenario,
  playerChoiceThreeOptionsScenario,
  optionalEffectScenario,
  revealTriggerScenario,
];

export type {
  ExpectedResponse,
  PartialGameState,
  PartialPlayerState,
  Scenario,
  ScenarioCategory,
  ScenarioMode,
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
