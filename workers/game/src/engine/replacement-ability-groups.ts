/** Nonserialized authoring metadata: alternative predicates of one printed ability.
 * Retained block IDs remain the concrete runtime/persistence protocol. */
export const REPLACEMENT_ABILITY_GROUPS: Readonly<Record<string, readonly (readonly string[])[]>> = {
  // OP-08 printed text: opponent-effect removal OR any K.O., one trash + draw.
  "OP08-045": [["replacement_ko", "replacement_removal"]],
};
