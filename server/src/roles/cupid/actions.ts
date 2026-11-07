import type { RoleActions } from "../RoleTypes";

const picks = new Map<string, string[]>();

export const actions: RoleActions = {
  select: ({ actorId, targetId }) => {
    const selected = picks.get(actorId) ?? [];
    picks.set(actorId, selected.includes(targetId)
      ? selected.filter(id => id !== targetId)
      : [...selected.slice(-1), targetId]);
    return { ok: true };
  },
  getSelection: actorId => picks.get(actorId)?.at(-1) ?? null,
  getSelections: actorId => picks.get(actorId) ?? [],
  onNightStepEnd: ({ players, confirmedActorIds }) => {
    const cupid = players.find(p => p.isAlive && p.gameRole === "cupid" &&
      confirmedActorIds.has(p.id));
    if (!cupid) return [];
    const chosen = picks.get(cupid.id) ?? [];
    if (chosen.length !== 2 || chosen[0] === chosen[1] ||
        chosen.some(id => !players.some(p => p.id === id && p.isAlive && p.userRole === "player"))) {
      return [];
    }
    return [{ type: "link-lovers", targetIds: [chosen[0], chosen[1]] }];
  },
  reset: () => picks.clear(),
};
