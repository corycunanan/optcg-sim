import type { EffectResolverServices } from "./types.js";

/**
 * Non-serialized resolver dependencies.
 *
 * `GameState.executionContext` owns deterministic data. This companion object
 * owns executable services and is passed explicitly across recursive resolver
 * boundaries so modules never depend on mutable callback registration.
 */
export type ReplacementExecutionServices = Pick<
  EffectResolverServices,
  "executeActionChain"
>;
export type { EffectResolverServices } from "./types.js";
