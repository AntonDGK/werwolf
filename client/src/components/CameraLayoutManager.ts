import type { PublicPlayer } from "../types/Player";

export type CameraGroupKind = "highlight" | "nothighlight" | "dead";

export type CameraGroup = {
  kind: CameraGroupKind;
  players: PublicPlayer[];
};

export type CameraRow = {
  id: string;
  kind: "living" | "dead";
  groups: CameraGroup[];
  count: number;
  fitCount: number;
};

export type CameraLayout = {
  rows: CameraRow[];
  hasHighlight: boolean;
};

function livingRowSizes(count: number, available: number, narrator: boolean): number[] {
  if (!count) return [];
  if (available <= 1) return [count];
  if (count === 1) return [1];
  if (count === 2) return narrator ? [1, 1] : [2];
  if (count <= 3) return [count];
  if (count >= 9 && available >= 3) return [3, 3, count - 6];
  if (count === 8) return narrator ? [5, 3] : [4, 4];
  if (count === 7) return [3, 4];
  return [3, count - 3];
}

function groupPlayers(
  players: PublicPlayer[],
  kindOf: (player: PublicPlayer) => CameraGroupKind,
): CameraGroup[] {
  return players.reduce<CameraGroup[]>((groups, player) => {
    const kind = kindOf(player);
    const previous = groups[groups.length - 1];
    if (previous?.kind === kind) previous.players.push(player);
    else groups.push({ kind, players: [player] });
    return groups;
  }, []);
}

export function calculateCameraLayout(
  players: readonly PublicPlayer[],
  focusedPlayerIds: readonly string[] = [],
): CameraLayout {
  const shown = players.filter(player => player.userRole !== "gamemaster");
  const focused = new Set(focusedPlayerIds);
  const narrator = shown.find(player => player.userRole === "storyteller");
  const active = shown.filter(player => player.userRole === "player" && focused.has(player.id));
  const living = shown.filter(player => player.userRole === "player" && player.isAlive && !focused.has(player.id));
  const dead = shown.filter(player => player.userRole === "player" && !player.isAlive && !focused.has(player.id));
  const hasHighlight = active.length > 0;

  // Erzähler und aktive Rollen zuerst.
  const ordered = [...(narrator ? [narrator] : []), ...active, ...living];
  const deadRowCount = Math.ceil(dead.length / 4);
  const sizes = livingRowSizes(ordered.length, Math.max(1, 3 - deadRowCount), Boolean(narrator));
  const rows: CameraRow[] = [];

  for (let index = 0, offset = 0; index < sizes.length; index++) {
    const rowPlayers = ordered.slice(offset, offset + sizes[index]);
    offset += sizes[index];
    const highlighted = rowPlayers.filter(player => player.userRole === "storyteller" || focused.has(player.id));
    const others = rowPlayers.filter(player => player.userRole !== "storyteller" && !focused.has(player.id));

    // Erzähler innerhalb der Highlight-Gruppe zentrieren.
    if (narrator && highlighted.some(player => player.id === narrator.id)) {
      const rolePlayers = highlighted.filter(player => player.id !== narrator.id);
      const middle = Math.ceil(rolePlayers.length / 2);
      highlighted.splice(0, highlighted.length, ...rolePlayers.slice(0, middle), narrator, ...rolePlayers.slice(middle));
    }

    rows.push({
      id: `living-${index}`,
      kind: "living",
      count: rowPlayers.length,
      fitCount: rowPlayers.length,
      groups: groupPlayers([...highlighted, ...others], player =>
        player.userRole === "storyteller" || focused.has(player.id) ? "highlight" : "nothighlight"),
    });
  }

  // Maximal vier nicht aktive Tote je Reihe.
  for (let index = 0; index < deadRowCount; index++) {
    const rowPlayers = dead.slice(index * 4, (index + 1) * 4);
    rows.push({
      id: `dead-${index}`,
      kind: "dead",
      count: rowPlayers.length,
      fitCount: rowPlayers.length,
      groups: [{ kind: "dead", players: rowPlayers }],
    });
  }

  return { rows, hasHighlight };
}
