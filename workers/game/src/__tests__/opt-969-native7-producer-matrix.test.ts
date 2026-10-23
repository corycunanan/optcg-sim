/** Capture harness is opt-in and targets only the immutable writer prototype. */
import { expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { capturePairs } from "./native7-producer-pairs.js";
import { cases } from "./native7-producer-cases.js";
import {
  assertDonOffer,
  command,
  memory,
  runtime,
  save,
  type ProducerScenario,
} from "./native7-producer-support.js";
import type { GameAction } from "../types.js";
import type { EffectBlock } from "../engine/effect-types.js";
const dir = fileURLToPath(
  new URL("./fixtures/opt-969-native7-producers/", import.meta.url)
);
it.skipIf(!process.env.OPT969_CAPTURE)(
  "captures finite matrix from frozen writer",
  async () => {
    const root = process.env.OPT969_PRODUCER_ROOT;
    if (!root) throw new Error("Producer root required");
    const rt = await runtime(root);
    const { rig, synSchema } = (await import(
      `${root}/workers/game/src/__tests__/opt-960-rig.ts`
    )) as typeof import("./opt-960-rig.js");
    mkdirSync(dir, { recursive: true });
    await capturePairs(root, dir);
    for (const c of cases) {
      const r = rig();
      const owner = c.owner ?? 0;
      r.state.turn.activePlayerIndex = owner;
      r.deck(0, 5);
      r.deck(1, 5);
      if (!c.homogeneous)
        r.state.players[owner].donCostArea[0].state = "RESTED";
      if (c.donorCount)
        r.state.players[owner].donCostArea = r.state.players[
          owner
        ].donCostArea.slice(0, c.donorCount);
      for (let i = 0; i < 2; i++) r.put(`hand-${i}`, owner, "HAND");
      const block: EffectBlock = {
        id: "activate",
        category: "activate",
        trigger: { keyword: "ACTIVATE_MAIN" },
        costs: c.costs,
        actions: c.actions ?? [{ type: "DRAW", params: { amount: 1 } }],
      };
      const replacement: EffectBlock = {
        id: "replacement",
        category: "replacement",
        replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" },
        flags: { optional: true, once_per_turn: true },
        replacement_actions: [
          ...(c.replacementDon
            ? [
                {
                  type: "RETURN_DON_TO_DECK",
                  params: { amount: c.replacementDon },
                } as const,
              ]
            : []),
          { type: "TRASH_FROM_HAND", params: { amount: 1 } },
          ...(c.replacement === "terminal"
            ? [{ type: "MILL", params: { amount: 5 } } as const]
            : []),
        ],
      };
      const sourceOwner = c.stage === "life" ? (owner === 0 ? 1 : 0) : owner;
      const handCompound = c.costs.some(
        (cost) => cost.type === "PLACE_SELF_AND_HAND_TO_DECK"
      );
      const source = r.put(
        `matrix-${c.id}`,
        sourceOwner,
        handCompound ? "STAGE" : "CHARACTER",
        {
          ...(handCompound ? { data: { type: "Stage" } } : {}),
          schema: synSchema(
            `matrix-${c.id}`,
            [
              ...(c.replacement ? [replacement] : []),
              ...(c.stage === "life" ? [] : [block]),
            ],
            handCompound ? "Stage" : "Character"
          ),
        }
      );
      const activator =
        c.stage === "life"
          ? r.put(`activator-${c.id}`, owner, "CHARACTER", {
              schema: synSchema(`activator-${c.id}`, [block]),
            })
          : source;
      if (c.stage === "life")
        for (let i = 0; i < 2; i++)
          r.put(`opponent-hand-${i}`, sourceOwner, "HAND");
      for (let i = 0; i < 2; i++) r.put(`trash-${i}`, owner, "TRASH");
      if (c.attached) {
        const p = r.state.players[owner];
        const other = r.put(`other-host-${c.id}`, owner, "CHARACTER");
        for (const host of [p.leader, source, other]) {
          const d = p.donCostArea.pop()!;
          host.attachedDon = [{ ...d, attachedTo: host.instanceId }];
        }
      }
      if (c.holds)
        for (const [i, donor] of r.state.players[owner].donCostArea
          .slice(1, 3)
          .entries())
          r.state.prohibitions.push({
            id: `held-${i}`,
            sourceCardInstanceId: source.instanceId,
            sourceEffectBlockId: "activate",
            prohibitionType: "CANNOT_REFRESH",
            scope: {},
            duration: { type: i ? "THIS_TURN" : "SKIP_NEXT_REFRESH" },
            controller: owner,
            appliesTo: [donor.instanceId],
            usesRemaining: null,
          } as never);
      if (c.watcher)
        r.put(`watcher-${c.id}`, owner, "CHARACTER", {
          schema: synSchema(`watcher-${c.id}`, [
            {
              id: "watch",
              category: "auto",
              trigger: { event: "CARD_TRASHED_FROM_HAND" },
              flags: { once_per_turn: true },
              costs: [{ type: "DON_MINUS", amount: 1 }],
              actions: [{ type: "DRAW", params: { amount: 1 } }],
            },
          ]),
        });
      const initial = await save(rt, r.state, r.db);
      let loaded = (await memory(rt, initial).repo.load())!;
      const corpus: ProducerScenario = {
        id: c.id,
        initial,
        steps: [],
        payer: owner,
        sourceId: source.instanceId,
        expectation: {
          returned: c.returned,
          hand: c.hand,
          meaningfulPauses: 0,
          ...(c.opponentReturned
            ? { opponentReturned: c.opponentReturned }
            : {}),
        },
      };
      let action: GameAction = {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: activator.instanceId,
        effectId: "activate",
      };
      for (let i = 0; i < 18; i++) {
        const state = command(rt, loaded.state, loaded.cardDb, action);
        const stored = await save(rt, state, loaded.cardDb);
        corpus.steps.push({
          action: {
            ...action,
            ...(loaded.state.pendingPrompt?.promptId
              ? { promptId: loaded.state.pendingPrompt.promptId }
              : {}),
          },
          stored,
        });
        loaded = (await memory(rt, stored).repo.load())!;
        if (!loaded.state.pendingPrompt) break;
        assertDonOffer(loaded.state);
        const p = loaded.state.pendingPrompt.options;
        if (p.promptType === "OPTIONAL_EFFECT")
          action = {
            type: "PLAYER_CHOICE",
            choiceId: c.replacement === "decline" ? "skip" : "accept",
          };
        else if (p.promptType === "SELECT_TARGET")
          action = {
            type: "SELECT_TARGET",
            selectedInstanceIds: p.validTargets.slice(0, p.countMin),
          };
        else if (p.promptType === "ARRANGE_TOP_CARDS")
          action = {
            type: "ARRANGE_TOP_CARDS",
            orderedInstanceIds: p.cards.map((card) => card.instanceId),
            keptCardInstanceId: "",
            destination: "bottom",
          };
        else if (p.promptType === "PLAYER_CHOICE") {
          const choices = p.choices.filter((choice) => !choice.disabled);
          if (p.donIdentityReturn) {
            corpus.expectation.meaningfulPauses++;
            const frame = loaded.state.effectStack.at(-1)!;
            const current = frame.costs?.[frame.currentCostIndex];
            const amount =
              current && "amount" in current ? current.amount : undefined;
            const count =
              current?.type === "VARIABLE_DON_RETURN" &&
              current.amount === undefined
                ? (c.variableCount ?? 1)
                : typeof amount === "number"
                  ? amount
                  : 1;
            const preferredIds = c.preferAttached
              ? [
                  i === 0
                    ? r.state.players[owner].leader.attachedDon[0].instanceId
                    : source.attachedDon[0].instanceId,
                ]
              : c.holds
                ? r.state.prohibitions.flatMap((effect) => effect.appliesTo)
                : [];
            const preferred = choices.find((choice) => {
              const ids = JSON.parse(
                choice.id.slice("don-return-ids:".length)
              ) as string[];
              return (
                ids.length === count &&
                ids.some((id) => preferredIds.includes(id))
              );
            });
            const choice =
              preferred ??
              choices.find(
                (choice) =>
                  JSON.parse(choice.id.slice("don-return-ids:".length))
                    .length === count &&
                  choice.label.includes(
                    c.preferAttached ? "Attached" : "Active"
                  )
              ) ??
              choices.find(
                (choice) =>
                  JSON.parse(choice.id.slice("don-return-ids:".length))
                    .length === count
              );
            if (!choice) throw new Error(`Missing plan ${c.id}`);
            action = { type: "PLAYER_CHOICE", choiceId: choice.id };
          } else action = { type: "PLAYER_CHOICE", choiceId: choices[0].id };
        } else throw new Error(`Unhandled ${p.promptType}`);
      }
      expect(loaded.state.pendingPrompt, c.id).toBeNull();
      expect(loaded.state.effectStack, c.id).toHaveLength(0);
      // Independent resource checks: cost return counts, DRAW and zero-payment reachability.
      expect(
        loaded.state.players[owner].donDeck.length -
          r.state.players[owner].donDeck.length,
        c.id
      ).toBe(c.returned);
      expect(loaded.state.players[owner].hand.length, c.id).toBe(c.hand);
      if (c.opponentReturned)
        expect(
          loaded.state.players[owner === 0 ? 1 : 0].donDeck.length -
            r.state.players[owner === 0 ? 1 : 0].donDeck.length
        ).toBe(c.opponentReturned);
      if (c.replacement === "terminal" || c.terminal)
        expect(loaded.state.status, c.id).toBe("FINISHED");
      writeFileSync(
        `${dir}/${c.id}.json`,
        JSON.stringify(corpus, null, 2) + "\n"
      );
    }
    const hash = (b: string) => createHash("sha256").update(b).digest("hex");
    const payloads = Object.fromEntries(
      readdirSync(dir)
        .filter((f) => f !== "manifest.json" && f.endsWith(".json"))
        .sort()
        .map((f) => [f, hash(readFileSync(`${dir}/${f}`, "utf8"))])
    );
    const all = Object.keys(payloads).map(
      (f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as ProducerScenario
    );
    const sources = [
      "opt-969-native7-producers.test.ts",
      "opt-969-native7-producer-matrix.test.ts",
      "native7-producer-cases.ts",
      "native7-producer-pairs.ts",
      "native7-producer-support.ts",
    ];
    writeFileSync(
      `${dir}/manifest.json`,
      JSON.stringify(
        {
          producerCommit: "ed6b264be4e38e2d52f4db49429f8efd976f5d45",
          productionPatchSha256:
            "9d0cc4810e7cf9df01e979db4810429c62804fa830d7f994ef767716aa1e8858",
          generators: Object.fromEntries(
            sources.map((f) => [
              f,
              hash(
                readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8")
              ),
            ])
          ),
          producerSource: JSON.parse(
            readFileSync(`${dir}/producer/metadata.json`, "utf8")
          ),
          scenarios: all.length,
          startingBoundaries: all.reduce((n, c) => n + c.steps.length, 0),
          storageContexts: ["live", "undo-first", "undo-later", "embedded"],
          continuationExecutions:
            4 *
            all.reduce(
              (n, c) => n + (c.steps.length * (c.steps.length + 1)) / 2,
              0
            ),
          acceptance: Object.fromEntries(
            all.map((c) => [
              c.id,
              {
                sourceId: c.sourceId,
                payer: c.payer,
                independentExpected: c.expectation,
                sourceCardDbSha256: hash(
                  JSON.stringify(c.initial["session:card-db"])
                ),
                startingBoundaries: c.steps.length,
                replies: c.steps.map((s) => s.action),
              },
            ])
          ),
          laterPauses: all.reduce(
            (n, c) =>
              n +
              c.steps.filter(
                (s) =>
                  !!(s.stored.session as { state: { pendingPrompt: unknown } })
                    .state.pendingPrompt
              ).length,
            0
          ),
          payloads,
        },
        null,
        2
      ) + "\n"
    );
  }
);
