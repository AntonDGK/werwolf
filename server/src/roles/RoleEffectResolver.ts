import type { RoleActionPlayer, RoleEffect } from "./RoleTypes";

export type ResolvedRoleEffects = {
  eliminated: { targetId: string; reason: string }[];
  revealed: string[];
};

export function resolveRoleEffects(
  effects: readonly RoleEffect[],
  players: readonly RoleActionPlayer[],
): ResolvedRoleEffects {
  const valid = new Map(players.filter(p => p.userRole === "player").map(p => [p.id, p]));
  const protectedIds = new Set(effects.filter(e => e.type === "protect").map(e => e.targetId));
  const eliminated = new Map<string, string>();
  const revealed = new Set<string>();

  for (const effect of effects) {
    const target = valid.get(effect.targetId);
    if (!target) continue;
    if (effect.type === "eliminate" && target.isAlive && !protectedIds.has(effect.targetId)) {
      if (!eliminated.has(effect.targetId)) eliminated.set(effect.targetId, effect.reason);
    }
    if (effect.type === "reveal") revealed.add(effect.targetId);
  }

  return {
    eliminated: [...eliminated].map(([targetId, reason]) => ({ targetId, reason })),
    revealed: [...revealed],
  };
}
