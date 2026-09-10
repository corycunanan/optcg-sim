import { getAllAuthoredSchemas } from "../src/engine/schema-registry.js";
const flips: unknown[] = [],
  prohibitions: unknown[] = [],
  rests: unknown[] = [];
function walk(
  v: unknown,
  path: string,
  visit: (v: Record<string, unknown>, path: string) => void
) {
  if (!v || typeof v !== "object") return;
  if (Array.isArray(v)) {
    v.forEach((x, i) => walk(x, `${path}[${i}]`, visit));
    return;
  }
  visit(v as Record<string, unknown>, path);
  Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`, visit));
}
for (const [id, s] of Object.entries(getAllAuthoredSchemas()))
  walk(s, id, (v, path) => {
    if (
      path.includes(".costs") &&
      ["TURN_LIFE_FACE_UP", "TURN_LIFE_FACE_DOWN"].includes(v.type as string)
    )
      flips.push({ path, ...v });
    if (
      v.type === "CANNOT_BE_RESTED" ||
      v.prohibition_type === "CANNOT_BE_RESTED"
    )
      prohibitions.push({ path, ...v });
    if (
      v.type === "SET_REST" &&
      (s.card_type === "Stage" || s.card_type === "Leader")
    )
      rests.push({ path, ...v });
  });
console.log(JSON.stringify({ flips, prohibitions, rests }, null, 2));
