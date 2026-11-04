/** Constructed legacy protocol-harness expectations. Historical inputs stay frozen.
 * The inherited replay harness explicitly supplies old/prefixed prompt IDs.
 * These values do not count as actual writer/prompt-allocation coverage.
 * Full deltas against frozen OPT-967 values are captured separately; the
 * independent final writer corpus retains actual allocator IDs unchanged.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
const values = JSON.parse(
  gunzipSync(
    readFileSync(resolve(__dirname, "opt-968-candidate-expectations.json.gz"))
  ).toString()
) as Record<string, unknown>;
export function candidateExpected<T>(key: string): T {
  if (!(key in values)) throw new Error(`missing candidate expectation ${key}`);
  return structuredClone(values[key]) as T;
}
