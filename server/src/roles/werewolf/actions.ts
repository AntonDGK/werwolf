
import type { RoleActions } from "../RoleTypes";

export type WerewolfVoteResult =
  | { type: "none" }
  | { type: "tie" }
  | { type: "winner"; targetId: string };

export function evaluateWerewolfVotes(
  votes: string[]
): WerewolfVoteResult {
  if (votes.length === 0) {
    return { type: "none" };
  }

  const counts = new Map<string, number>();

  for (const targetId of votes) {
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }

  const highest = Math.max(...counts.values());

  const winners = [...counts.entries()]
    .filter(([, count]) => count === highest);

  if (winners.length !== 1) {
    return { type: "tie" };
  }

  return {
    type: "winner",
    targetId: winners[0][0],
  };
}

// Hier verbinden wir später die Aktion mit der Engine.
export const actions: RoleActions = {};
