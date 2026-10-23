/** Native-v7 identity plans. Generic choices remain the authority and old-client fallback. */
import type { CardData, GameState } from "../../types.js";
import type { Duration } from "../effect-types.js";
import { donEffectSignature } from "./cost/targets.js";
const durationLabels: Record<Duration["type"], string> = {
  THIS_TURN: "this turn", THIS_BATTLE: "this battle", SKIP_NEXT_REFRESH: "through its next refresh",
  UNTIL_END_OF_OPPONENT_NEXT_END_PHASE: "until the end of opponent’s next End Phase",
  UNTIL_END_OF_OPPONENT_NEXT_TURN: "until the end of opponent’s next turn",
  UNTIL_END_OF_YOUR_NEXT_TURN: "until the end of your next turn",
  UNTIL_START_OF_YOUR_NEXT_TURN: "until the start of your next turn",
  PERMANENT: "while the effect remains", WHILE_CONDITION: "while its condition holds",
};
function sourceLabel(state: GameState, id: string, db: Map<string, CardData>): string {
  for (const [playerIndex, player] of state.players.entries()) {
    const prefix = `Player ${playerIndex + 1} `;
    if (player.leader.instanceId === id) return `${prefix}${db.get(player.leader.cardId)?.name ?? "Leader"} (Leader)`;
    const slot = player.characters.findIndex(card => card?.instanceId === id);
    if (slot >= 0) return `${prefix}${db.get(player.characters[slot]!.cardId)?.name ?? "Character"} (Character slot ${slot + 1})`;
    if (player.stage?.instanceId === id) return `${prefix}${db.get(player.stage.cardId)?.name ?? "Stage"} (Stage)`;
    const moved = player.trash.find(card => card.instanceId === id);
    if (moved) return `${prefix}${db.get(moved.cardId)?.name ?? "card"}`;
  }
  return "a prior card effect";
}
function donorEffectsLabel(state: GameState, id: string, db: Map<string, CardData>): string {
  const describe = (name: string, source: string, duration: Duration) => `${name} from ${sourceLabel(state, source, db)} (${durationLabels[duration.type]})`;
  return [
    ...state.prohibitions.filter(effect => effect.appliesTo.includes(id)).map(effect => describe(effect.prohibitionType === "CANNOT_REFRESH" ? "Cannot become active" : effect.prohibitionType.toLowerCase().replaceAll("_", " "), effect.sourceCardInstanceId, effect.duration)),
    ...state.activeEffects.filter(effect => effect.appliesTo.includes(id)).map(effect => describe(effect.modifiers.map(modifier => modifier.type.toLowerCase().replaceAll("_", " ")).join(", "), effect.sourceCardInstanceId, effect.duration)),
  ].join("; ");
}
export function buildDonIdentityPlans(state: GameState, owner: 0 | 1, valid: string[], countMin: number, countMax: number, db: Map<string, CardData>) {
  const p = state.players[owner];
  const hosts = [p.leader, ...p.characters.filter(c => c !== null)];
  const donors = [...p.donCostArea, ...hosts.flatMap(c => c.attachedDon)].filter(d => valid.includes(d.instanceId));
  const byKey = new Map<string, { donIds: string[]; label: string }>();
  for (const d of donors) {
    const signature = donEffectSignature(state, d.instanceId);
    const key = `${d.attachedTo ?? d.state}|${signature}`;
    const host = hosts.find(c => c.instanceId === d.attachedTo);
    const label = `${host ? `Attached to ${db.get(host.cardId)?.name ?? "Character"} (${host === p.leader ? "Leader" : `Character slot ${p.characters.findIndex(card => card?.instanceId === host.instanceId) + 1}`})` : `${d.state === "ACTIVE" ? "Active" : "Rested"} in cost area`}${signature ? ` — ${donorEffectsLabel(state, d.instanceId, db)}` : ""}`;
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
