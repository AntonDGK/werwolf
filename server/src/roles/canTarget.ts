
import type { RoleDefinition } from "./RoleTypes";

type TargetPlayer = {
  id: string;
  gameRole: string | null;
  isAlive: boolean;
};

export function canRoleTarget(
  role: RoleDefinition,
  actor: TargetPlayer,
  target: TargetPlayer
): boolean {
  const rules = role.targeting;

  if (rules?.onlyAliveTargets && !target.isAlive) {
    return false;
  }

  if (rules?.allowSelfTarget === false && actor.id === target.id) {
    return false;
  }

  if (
    rules?.allowSameRoleTarget === false &&
    actor.gameRole !== null &&
    actor.gameRole === target.gameRole
  ) {
    return false;
  }

  return true;
}
