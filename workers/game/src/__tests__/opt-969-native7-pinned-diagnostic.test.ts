/** Opt-in exhaustive negative control: inspect every original-reader starting boundary. */
import { expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import {
  command,
  memory,
  runtime,
  save,
  type ProducerScenario,
} from "./native7-producer-support.js";
it.skipIf(!process.env.OPT969_NEGATIVE)(
  "enumerates every immutable writer boundary on the pinned original reader",
  async () => {
    const root = process.env.OPT969_REPLAY_ROOT;
    if (!root) throw new Error("Explicit pinned reader root required");
    const rt = await runtime(root);
    const directory = new URL(
      "./fixtures/opt-969-native7-producers/",
      import.meta.url
    );
    const manifest = JSON.parse(
      readFileSync(new URL("manifest.json", directory), "utf8")
    ) as { payloads: Record<string, string>; startingBoundaries: number };
    const outcomes: {
      id: string;
      start: number;
      matched: boolean;
      error?: string;
    }[] = [];
    for (const file of Object.keys(manifest.payloads)) {
      const c = JSON.parse(
        readFileSync(new URL(file, directory), "utf8")
      ) as ProducerScenario;
      const starts = [
        c.initial,
        ...c.steps.slice(0, -1).map((step) => step.stored),
      ];
      for (let start = 0; start < starts.length; start++) {
        try {
          let loaded = (await memory(rt, starts[start]).repo.load())!;
          for (const step of c.steps.slice(start)) {
            const next = command(rt, loaded.state, loaded.cardDb, step.action);
            const stored = await save(rt, next, loaded.cardDb);
            expect(stored).toEqual(step.stored);
            loaded = (await memory(rt, stored).repo.load())!;
          }
          outcomes.push({ id: c.id, start, matched: true });
        } catch (error) {
          outcomes.push({
            id: c.id,
            start,
            matched: false,
            error:
              error instanceof Error
                ? error.message.slice(0, 1200)
                : String(error),
          });
        }
      }
    }
    writeFileSync(
      process.env.OPT969_NEGATIVE!,
      JSON.stringify(
        {
          readerBase: "4858458abb4516c3085543f84c5b20e2364c8ec6",
          visited: outcomes.length,
          matched: outcomes.filter((o) => o.matched).length,
          mismatched: outcomes.filter((o) => !o.matched).length,
          outcomes,
        },
        null,
        2
      ) + "\n"
    );
    expect(outcomes).toHaveLength(manifest.startingBoundaries);
    expect(
      outcomes.some(
        (o) =>
          o.id === "DON_MINUS-DON_MINUS-active" && o.start === 1 && !o.matched
      )
    ).toBe(true);
  }
);
