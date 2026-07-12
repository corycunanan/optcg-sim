import { buildActionCoverageInventory } from "./action-coverage-contract.js";
import { listRegisteredActionTypes } from "./effect-resolver/resolver.js";
import { getAllAuthoredSchemas } from "./schema-registry.js";

const inventory = buildActionCoverageInventory(
  getAllAuthoredSchemas(),
  listRegisteredActionTypes()
);

console.log(
  `Authored action inventory — ${inventory.authoredUses} uses, ` +
    `${inventory.authoredTypes.length} types, ${inventory.handledTypes.length} handled, ` +
    `${inventory.executedTypes.length} executed`
);

if (inventory.missingHandlers.length > 0) {
  console.error(`Missing handlers: ${inventory.missingHandlers.join(", ")}`);
}
if (inventory.missingExecutionTests.length > 0) {
  console.error(
    `Missing execution tests: ${inventory.missingExecutionTests.join(", ")}`
  );
}
if (
  inventory.missingHandlers.length > 0 ||
  inventory.missingExecutionTests.length > 0
) {
  process.exitCode = 1;
}
