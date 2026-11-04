import type { Action, Cost, TargetFilter } from "../engine/effect-types.js";
export interface ProducerCase {
  id: string;
  costs: Cost[];
  owner?: 0 | 1;
  homogeneous?: boolean;
  attached?: boolean;
  holds?: boolean;
  replacement?: "decline" | "accept" | "terminal";
  stage?: "fixed" | "field" | "shuffle" | "arrange" | "life";
  actions?: Action[];
  watcher?: boolean;
  terminal?: boolean;
  preferAttached?: boolean;
  opponentReturned?: number;
  replacementDon?: number;
  donorCount?: number;
  returned: number;
  hand: number;
  variableCount?: number;
}
const don = (
  type: "DON_MINUS" | "VARIABLE_DON_RETURN" = "DON_MINUS",
  amount: number | undefined = 1
): Cost => ({ type, ...(amount === undefined ? {} : { amount }) });
export const cases: ProducerCase[] = [
  {
    id: "later-index2",
    costs: [
      { type: "TRASH_FROM_HAND", amount: 1 },
      don(),
      don("VARIABLE_DON_RETURN"),
    ],
    returned: 2,
    hand: 2,
  },
  {
    id: "fixed-prefix",
    costs: [{ type: "REST_DON", amount: 1 }, don()],
    returned: 1,
    hand: 3,
  },
  {
    id: "variable-count-after-fixed",
    costs: [don(), { type: "VARIABLE_DON_RETURN" }],
    returned: 3,
    hand: 3,
    variableCount: 2,
  },
  {
    id: "fixed-count2-payer1",
    costs: [don("DON_MINUS", 2), don("VARIABLE_DON_RETURN", 2)],
    owner: 1,
    returned: 4,
    hand: 3,
  },
  {
    id: "sole-equivalent",
    costs: [don(), don()],
    homogeneous: true,
    returned: 2,
    hand: 3,
  },
  { id: "forced-all", costs: [don("DON_MINUS", 8)], returned: 8, hand: 3 },
  {
    id: "attached-hosts",
    costs: [don(), don()],
    attached: true,
    preferAttached: true,
    owner: 1,
    returned: 2,
    hand: 3,
  },
  {
    id: "held-duration-groups",
    costs: [don(), don()],
    holds: true,
    returned: 2,
    hand: 3,
  },
  {
    id: "zero-don-fixed",
    costs: [don("DON_MINUS", 0), don()],
    returned: 1,
    hand: 3,
  },
  {
    id: "zero-don-variable-suffix",
    costs: [don(), don("VARIABLE_DON_RETURN", 0)],
    returned: 1,
    hand: 3,
  },
  {
    id: "zero-variable-initial",
    costs: [don("VARIABLE_DON_RETURN", 0)],
    returned: 0,
    hand: 3,
  },
  {
    id: "zero-fixed-suffix",
    costs: [don(), don("DON_MINUS", 0)],
    returned: 1,
    hand: 3,
  },
];
for (const type of ["DON_MINUS", "VARIABLE_DON_RETURN"] as const)
  for (const [label, filter, impossible] of [
    ["active", { is_active: true }],
    ["rested", { is_rested: true }],
    ["exact-active", { state: "ACTIVE" }],
    ["exact-rested", { state: "RESTED" }],
    ["false-active", { is_active: false }],
    ["false-rested", { is_rested: false }],
    ["both-false", { is_active: false, is_rested: false }],
    ["contradiction", { is_active: true, is_rested: true }, true],
    ["exact-contradiction", { is_rested: true, state: "ACTIVE" }, true],
    ["exact-conjunction", { is_rested: true, state: "RESTED" }],
  ] as [string, TargetFilter, boolean?][])
    cases.push({
      id: `${type}-filter-${label}`,
      costs: [
        { type: "TRASH_FROM_HAND", amount: 1 },
        { type, amount: 1, filter },
      ],
      attached: true,
      owner: type === "DON_MINUS" ? 0 : 1,
      returned: impossible ? 0 : 1,
      hand: impossible ? 2 : 2,
    });
for (const type of ["KO_OWN_CHARACTER", "TRASH_OWN_CHARACTER"] as const)
  for (const after of [false, true])
    for (const replacement of [false, true])
      cases.push({
        id: `${type}-zero-${after ? "after" : "initial"}-${replacement ? "replacement" : "plain"}`,
        costs: [
          ...(after ? [{ type: "TRASH_FROM_HAND", amount: 1 } as Cost] : []),
          { type, amount: 0 },
          don(),
        ],
        ...(replacement ? { replacement: "decline" as const } : {}),
        returned: 1,
        hand: after ? 2 : 3,
      });
for (const stage of ["fixed", "field", "shuffle", "arrange", "life"] as const)
  for (const replacement of ["decline", "accept", "terminal"] as const) {
    const cost: Cost =
      stage === "fixed"
        ? { type: "TRASH_SELF" }
        : stage === "field"
          ? { type: "TRASH_OWN_CHARACTER", amount: 1 }
          : stage === "life"
            ? {
                type: "ADD_OWN_CHARACTER_TO_LIFE",
                amount: 1,
                controller: "OPPONENT",
                position: "TOP_OR_BOTTOM",
              }
            : {
                type: "PLACE_SELF_AND_TRASH_TO_DECK",
                amount: 1,
                position: "BOTTOM",
              };
    cases.push({
      id: `${stage}-${replacement}-then-don`,
      costs: [cost, don()],
      stage,
      replacement,
      returned: replacement === "decline" ? 1 : 0,
      hand: replacement === "decline" ? 3 : stage === "life" ? 2 : 1,
      ...(stage === "shuffle"
        ? {
            actions: [
              { type: "DRAW", params: { amount: 1 } },
              { type: "SHUFFLE_DECK" },
            ],
          }
        : {}),
    });
  }
for (const domain of ["HAND", "TRASH"] as const)
  for (const shuffle of [false, true])
    cases.push({
      id: `compound-${domain}-zero-${shuffle ? "shuffle" : "arrange"}`,
      costs: [
        {
          type:
            domain === "HAND"
              ? "PLACE_SELF_AND_HAND_TO_DECK"
              : "PLACE_SELF_AND_TRASH_TO_DECK",
          amount: 0,
          position: "BOTTOM",
        },
        don(),
      ],
      replacement: "decline",
      returned: 1,
      hand: 3,
      ...(shuffle
        ? {
            actions: [
              { type: "DRAW", params: { amount: 1 } },
              { type: "SHUFFLE_DECK" },
            ],
          }
        : {}),
    });

cases.push(
  {
    id: "choose-one-don",
    costs: [
      {
        type: "CHOOSE_ONE_COST",
        options: [don(), { type: "TRASH_FROM_HAND", amount: 1 }],
      },
      don(),
    ],
    returned: 2,
    hand: 3,
  },
  {
    id: "branch-don",
    costs: [
      {
        type: "CHOICE",
        options: [
          [don(), don("VARIABLE_DON_RETURN")],
          [{ type: "TRASH_FROM_HAND", amount: 1 }],
        ],
      },
    ],
    returned: 2,
    hand: 3,
  },
  {
    id: "any-rest-before-don",
    costs: [{ type: "REST_DON", amount: "ANY_NUMBER" }, don()],
    returned: 1,
    hand: 3,
  },
  {
    id: "nested-trigger-parent",
    costs: [don()],
    watcher: true,
    actions: [
      { type: "TRASH_FROM_HAND", params: { amount: 1 } },
      { type: "RETURN_DON_TO_DECK", params: { amount: 1 } },
      { type: "DRAW", params: { amount: 1 } },
    ],
    returned: 3,
    hand: 3,
  },
  {
    id: "selected-prefix-trigger-don",
    costs: [{ type: "TRASH_FROM_HAND", amount: 1 }, don()],
    watcher: true,
    returned: 2,
    hand: 3,
  },
  {
    id: "action-after-don",
    costs: [don()],
    actions: [
      { type: "RETURN_DON_TO_DECK", params: { amount: 1 } },
      { type: "DRAW", params: { amount: 1 } },
    ],
    returned: 2,
    hand: 3,
  },
  {
    id: "until-count-after-pause",
    costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
    actions: [
      { type: "RETURN_DON_TO_DECK", params: { until_count: 7 } },
      { type: "DRAW", params: { amount: 1 } },
    ],
    returned: 1,
    hand: 2,
  },
  {
    id: "positive-ko-decline",
    costs: [{ type: "KO_OWN_CHARACTER", amount: 1 }, don()],
    replacement: "decline",
    returned: 1,
    hand: 3,
  },
  {
    id: "terminal-cost-suppresses-don",
    costs: [
      { type: "TRASH_FROM_HAND", amount: 1 },
      { type: "MILL", amount: 5 },
      don(),
    ],
    returned: 0,
    hand: 1,
    terminal: true,
  }
);

cases.push(
  {
    id: "opponent-action-after-pause",
    costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
    actions: [
      {
        type: "RETURN_DON_TO_DECK",
        target: {
          type: "DON_IN_COST_AREA",
          controller: "OPPONENT",
          filter: { is_active: true },
        },
        params: { amount: 1 },
      },
      { type: "DRAW", params: { amount: 1 } },
    ],
    returned: 0,
    opponentReturned: 1,
    hand: 2,
  },
  {
    id: "replacement-action-amount",
    costs: [{ type: "TRASH_SELF" }, don()],
    replacement: "accept",
    replacementDon: 1,
    returned: 1,
    hand: 1,
  },
  {
    id: "insufficient-replacement-amount",
    costs: [{ type: "TRASH_SELF" }, don()],
    replacement: "accept",
    replacementDon: 2,
    donorCount: 1,
    returned: 1,
    hand: 3,
  }
);

cases.push({
  id: "active-held-filter",
  costs: [{ type: "DON_MINUS", amount: 1, filter: { is_active: true } }, don()],
  holds: true,
  returned: 2,
  hand: 3,
});

cases.push(
  {
    id: "accepted-fixed-don-prefix-rollback",
    costs: [don(), { type: "TRASH_SELF" }, don()],
    replacement: "accept",
    returned: 0,
    hand: 1,
  },
  {
    id: "declined-field-don-prefix",
    costs: [don(), { type: "TRASH_OWN_CHARACTER", amount: 1 }, don()],
    replacement: "decline",
    returned: 2,
    hand: 3,
  }
);
