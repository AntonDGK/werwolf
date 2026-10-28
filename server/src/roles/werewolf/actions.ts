
import type { RoleActions } from "../RoleTypes";

export type WerewolfVoteResult =
  | { type: "none" }
  | { type: "tie" }
  | { type: "winner"; targetId: string };

// Stimmen auswerten
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

  const winners = [...counts.entries()].filter(
    ([, count]) => count === highest
  );

  if (winners.length !== 1) {
    return { type: "tie" };
  }

  return {
    type: "winner",
    targetId: winners[0][0],
  };
}

// Werwolf-Abstimmung
export class WerewolfActions {
  private votes = new Map<string, string>();

  // Stimme setzen oder zurückziehen
  toggleVote(voterId: string, targetId: string): string | null {
    if (this.votes.get(voterId) === targetId) {
      this.votes.delete(voterId);
      return null;
    }

    this.votes.set(voterId, targetId);
    return targetId;
  }

  // Stimme entfernen
  removeVote(voterId: string): void {
    this.votes.delete(voterId);
  }

  // Eigene Auswahl
  getVote(voterId: string): string | null {
    return this.votes.get(voterId) ?? null;
  }

  // Stimmen zählen
  getCounts(): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const targetId of this.votes.values()) {
      counts[targetId] = (counts[targetId] ?? 0) + 1;
    }

    return counts;
  }

  // Ergebnis berechnen
  getResult(): WerewolfVoteResult {
    return evaluateWerewolfVotes([...this.votes.values()]);
  }

  // Abstimmung zurücksetzen
  reset(): void {
    this.votes.clear();
  }
}

// Gemeinsamer Zustand der aktuellen Runde
export const werewolfVotes = new WerewolfActions();

// Verbindung zur Rollen-Engine
export const actions: RoleActions = {
  select: ({ actorId, targetId }) => {
    werewolfVotes.toggleVote(actorId, targetId);
    return { ok: true };
  },

  getSelection: (actorId) => {
    return werewolfVotes.getVote(actorId);
  },

  onNightStepEnd: ({ players, confirmedActorIds }) => {
    const eligible = players.filter(p => p.userRole === "player" && p.isAlive && p.gameRole === "werewolf");
    const votes = eligible.filter(p => confirmedActorIds.has(p.id))
      .map(p => werewolfVotes.getVote(p.id)).filter((id): id is string => id !== null);
    const result = evaluateWerewolfVotes(votes);
    if (result.type !== "winner") return [];
    const target = players.find(p => p.id === result.targetId && p.userRole === "player" &&
      p.isAlive && p.gameRole !== "werewolf");
    return target ? [{ type: "eliminate", targetId: target.id, reason: "werewolf" }] : [];
  },

  reset: () => {
    werewolfVotes.reset();
  },
};
