import type { RoleTeam } from "../roles/RoleTypes";

export type WinCheckpoint = "night-end" | "day-vote";
export type WinParticipant = { id: string; roleId: string | null; isAlive: boolean };
export type WinDecision = {
  winner: string;
  winnerLabel?: string;
  checkpoint: WinCheckpoint;
  werewolves: number;
  villagers: number;
};
export type WinOptions = {
  getTeam?: (roleId: string | null) => RoleTeam;
  specialWins?: readonly { winner: string; winnerLabel?: string; priority: number }[];
};

export function decideWinCondition(
  players: readonly WinParticipant[],
  checkpoint: WinCheckpoint,
  lovers: readonly [string, string] | null,
  options: WinOptions = {},
): WinDecision | null {
  const living = players.filter(player => player.isAlive);
  const teamFor = options.getTeam ?? ((id: string | null) => id === "werewolf" ? "werewolves" : "village");
  const werewolves = living.filter(player => teamFor(player.roleId) === "werewolves").length;
  const villagers = living.length - werewolves;
  const result = (win: { winner: string; winnerLabel?: string }): WinDecision =>
    ({ winner: win.winner, winnerLabel: win.winnerLabel, checkpoint, werewolves, villagers });
  const wins: { winner: string; winnerLabel?: string; priority: number }[] = [];

  const livingLovers = lovers?.map(id => living.find(player => player.id === id)) ?? [];
  const mixedLoversAlive = livingLovers.length === 2 && livingLovers.every(Boolean) &&
    livingLovers.some(player => teamFor(player!.roleId) === "werewolves") &&
    livingLovers.some(player => teamFor(player!.roleId) !== "werewolves");

  if (mixedLoversAlive && living.length === 2) {
    wins.push({ winner: "lovers", priority: 100 });
  }
  if (werewolves === 0) wins.push({ winner: "village", priority: 0 });
  else if (!mixedLoversAlive &&
    (checkpoint === "day-vote" ? werewolves >= villagers : werewolves > villagers)) {
    wins.push({ winner: "werewolves", priority: 0 });
  }
  for (const entry of options.specialWins ?? []) {
    if (entry.winner && Number.isFinite(entry.priority)) wins.push(entry);
  }
  wins.sort((a, b) => b.priority - a.priority || a.winner.localeCompare(b.winner));
  return wins.length ? result(wins[0]) : null;
}
