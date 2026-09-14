import { getAllAuthoredSchemas } from "../src/engine/schema-registry.js";

const flips: Record<string, unknown>[] = [];
function walk(value: unknown, path: string): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, i) => walk(entry, `${path}[${i}]`));
    return;
  }
  const node = value as Record<string, unknown>;
  if (
    path.includes(".costs") &&
    ["TURN_LIFE_FACE_UP", "TURN_LIFE_FACE_DOWN"].includes(node.type as string)
  ) {
    flips.push({ path, ...node });
  }
  Object.entries(node).forEach(([key, entry]) => walk(entry, `${path}.${key}`));
}
for (const [id, schema] of Object.entries(getAllAuthoredSchemas()))
  walk(schema, id);
console.log(JSON.stringify(flips, null, 2));
