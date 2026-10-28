import type { RoleActions } from "../RoleTypes";

const revealedCaptains = new Set<string>();

export const actions: RoleActions = {
  onDayAction: ({ actorId, actionId }) => {
    if (actionId !== "reveal" || revealedCaptains.has(actorId)) {
      return { ok: false, reason: "Offenbarung nicht möglich." };
    }
    revealedCaptains.add(actorId);
    return { ok: true, effects: [{ type: "reveal", targetId: actorId }] };
  },

  getDayVoteWeight: (actorId) => revealedCaptains.has(actorId) ? 2 : 1,

  onGameReset: () => revealedCaptains.clear(),
};
