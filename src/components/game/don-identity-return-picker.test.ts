import { expect, it } from "vitest";
import { matchingDonIdentityChoice } from "./don-identity-return-picker";
it("matches an offered donor set despite UI grouping order, never stale/disabled/malformed alternatives", () => {
  const offered = 'don-return-ids:["b","a"]';
  const choices = [{ id: offered, label: "Two" }, { id: 'don-return-ids:["c"]', label: "Disabled", disabled: true }, { id: 'don-return-ids:["a","a"]', label: "Malformed" }];
  expect(matchingDonIdentityChoice(choices, ["a", "b"])).toBe(offered);
  for (const ids of [[], ["c"], ["a"], ["a", "a"], ["foreign"]]) expect(matchingDonIdentityChoice(choices, ids)).toBeNull();
});
