import type { PublicPlayer } from "../types/Player";

export type CameraPosition = {
  left: string;
  top: string;
  width: string;
};

export type CameraLayout = {
  positions: Record<string, CameraPosition>;
  rows: number;
};

const columns = [18, 50, 82];

export function calculateCameraLayout(
  players: readonly PublicPlayer[],
  focusedPlayerIds: readonly string[] = [],
): CameraLayout {
  const shown = players.filter(player => player.userRole !== "gamemaster");
  const alive = shown.filter(player => player.userRole === "storyteller" || player.isAlive);
  const dead = shown.filter(player => player.userRole === "player" && !player.isAlive);
  const livingRows = Math.ceil(alive.length / 3);
  const deadRows = Math.ceil(dead.length / 3);
  const rows = Math.max(1, livingRows + deadRows);
  const positions: Record<string, CameraPosition> = {};

  const place = (player: PublicPlayer, row: number, col: number) => {
    positions[player.id] = {
      left: `${columns[col]}%`,
      top: `${((row + 0.5) / rows) * 100}%`,
      width: shown.length <= 2 ? "31%" : "27%",
    };
  };

  if (alive.length > 0) {
    const centerRow = Math.floor((livingRows - 1) / 2);
    const host = alive.find(player => player.userRole === "storyteller") ?? alive[0];
    place(host, centerRow, 1);

    const slots = Array.from({ length: livingRows * 3 }, (_, index) => ({
      row: Math.floor(index / 3), col: index % 3,
    })).filter(slot => slot.row !== centerRow || slot.col !== 1);
    slots.sort((a, b) => {
      const distance = (slot: typeof a) =>
        Math.abs(slot.row - centerRow) * 3 + Math.abs(slot.col - 1);
      return distance(a) - distance(b) || a.row - b.row || a.col - b.col;
    });

    const focus = new Set(focusedPlayerIds);
    const remaining = alive.filter(player => player.id !== host.id);
    const ordered = [
      ...remaining.filter(player => focus.has(player.id)),
      ...remaining.filter(player => !focus.has(player.id)),
    ];
    ordered.forEach((player, index) => {
      const slot = slots[index];
      if (slot) place(player, slot.row, slot.col);
    });
  }

  dead.forEach((player, index) => {
    const col = [1, 0, 2][index % 3];
    place(player, livingRows + Math.floor(index / 3), col);
  });

  return { positions, rows };
}
