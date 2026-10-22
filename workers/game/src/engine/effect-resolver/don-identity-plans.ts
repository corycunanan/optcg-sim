/** Native-v7 identity plans. Generic choices remain the authority and old-client fallback. */
import type { CardData, GameState } from "../../types.js";
import { donEffectSignature } from "./cost/targets.js";
export function buildDonIdentityPlans(state: GameState, owner: 0 | 1, valid: string[], countMin: number, countMax: number, db: Map<string, CardData>) {
  const p = state.players[owner];
  const hosts = [p.leader, ...p.characters.filter(c => c !== null)];
  const donors = [...p.donCostArea, ...hosts.flatMap(c => c.attachedDon)].filter(d => valid.includes(d.instanceId));
  const byKey = new Map<string, { donIds: string[]; label: string }>();
  for (const d of donors) {
    const signature = donEffectSignature(state, d.instanceId);
    const key = `${d.attachedTo ?? d.state}|${signature}`;
    const host = hosts.find(c => c.instanceId === d.attachedTo);
    const label = `${host ? `Attached to ${db.get(host.cardId)?.name ?? "Character"} (${host === p.leader ? "Leader" : "Character"})` : `${d.state === "ACTIVE" ? "Active" : "Rested"} in cost area`}${signature ? " — held by an effect" : ""}`;
    const group = byKey.get(key) ?? { donIds: [], label };
    group.donIds.push(d.instanceId); byKey.set(key, group);
  }
  const groups = [...byKey.values()];
  const choices: { id: string; label: string }[] = [];
  // Enumerate group counts, not individual subsets of equivalent donors.
  const visit = (index: number, ids: string[], labels: string[]): void => {
    if (index === groups.length) {
      if (ids.length >= countMin && ids.length <= countMax) choices.push({ id: `don-return-ids:${JSON.stringify(ids)}`, label: `Return ${labels.join(" + ")} DON!!` });
      return;
    }
    const group = groups[index];
    for (let n = 0; n <= Math.min(group.donIds.length, countMax - ids.length); n++) visit(index + 1, [...ids, ...group.donIds.slice(0, n)], n ? [...labels, `${n} ${group.label}`] : labels);
  };
  visit(0, [], []);
  return { choices, donIdentityReturn: { countMin, countMax, groups } };
}
