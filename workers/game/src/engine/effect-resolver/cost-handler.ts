/**
 * Stable cost-resolver facade.
 *
 * Dependency direction is one-way: this facade re-exports focused modules;
 * cost submodules never import the facade.
 */
export { payCosts } from "./cost/payment.js";
export { costNeedsPlayerSelection, isCostPayable } from "./cost/payability.js";
export { computeCostTargets, getCostCards, resolveAmount } from "./cost/targets.js";
export {
  blockShufflesDeck,
  buildTrashToDeckArrangePrompt,
  deriveBranchLabel,
  getCostCtaLabel,
  getCostLabel,
  promptTypeToPhase,
} from "./cost/prompts.js";
export { applyCostSelection } from "./cost/resume.js";
export type { AppliedCostSelection } from "./cost/resume.js";
export { payCostsWithSelection } from "./cost/orchestrator.js";
