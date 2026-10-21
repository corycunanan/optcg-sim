/** Exact, separately captured candidate values. Historic inputs remain frozen.
 * No allocation, timestamps, propagation flags, or event payloads normalized.
 * See opt-967-candidate-deltas.json and the acceptance evidence for rationale.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
const values = JSON.parse(
  gunzipSync(
    readFileSync(resolve(__dirname, "opt-967-candidate-expectations.json.gz"))
  ).toString()
) as Record<string, unknown>;
export function candidateExpected<T>(key: string): T {
  if (!(key in values)) throw new Error(`missing candidate expectation ${key}`);
  return structuredClone(values[key]) as T;
}
