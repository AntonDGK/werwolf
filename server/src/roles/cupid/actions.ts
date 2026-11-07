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
  onConfirm: ({ targetIds }) => {
    if (targetIds.length !== 2 || targetIds[0] === targetIds[1]) {
      return { ok: false, reason: "Zwei unterschiedliche Spieler auswählen." };
    }
    return { ok: true, effects: [{ type: "link-lovers", targetIds: [targetIds[0], targetIds[1]] }] };
  },
  reset: () => picks.clear(),
};
