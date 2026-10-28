/**
 * Reine Gewinnerkennung. Sie erhält ausschließlich die Teilnehmer einer Runde,
 * nicht alle erstellten Accounts (ungenutzte Konten zählen nicht mit).
 * "null" bedeutet Dorfbewohner und gehört zum Dorf.
 */
export type GameSide = "werewolves" | "village";
export type WinCheckpoint = "day-vote" | "night-end";
export type WinParticipant = { roleId: string | null; isAlive: boolean };
export type WinDecision = {
  winner: GameSide;
  checkpoint: WinCheckpoint;
  werewolves: number;
  villagers: number;
};

export function decideWinner(
  participants: readonly WinParticipant[],
  checkpoint: WinCheckpoint,
): WinDecision | null {
  const living = participants.filter(p => p.isAlive);
  const werewolves = living.filter(p => p.roleId === "werewolf").length;
  const villagers = living.length - werewolves;
  if (werewolves === 0) {
    return { winner: "village", checkpoint, werewolves, villagers };
  }
  // Einheitliche Gleichstandsregel: Wölfe gewinnen bei gleicher Anzahl
  // oder Überzahl. Erst die tatsächliche Eliminierung ändert den Spielstand.
  // Gilt sowohl nach der Dorfabstimmung als auch nach der Nacht.
  const wolvesWin = werewolves >= villagers;
  return wolvesWin
    ? { winner: "werewolves", checkpoint, werewolves, villagers }
    : null;
}
