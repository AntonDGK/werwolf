import type { PublicPlayer } from "../types/Player";

export const CAMERA_SCALE = 1.5;

export type CameraPosition = {
  left: string;
  top: string;
  width: string;
};

export type CameraLayout = {
  positions: Record<string, CameraPosition>;
  rows: number;
  rowHeight: string;
  maxFrameWidth: string;
};

export function calculateCameraLayout(
  players: readonly PublicPlayer[],
  focusedPlayerIds: readonly string[] = [],
): CameraLayout {
  const shown = players.filter(player => player.userRole !== "gamemaster");
  const alive = shown.filter(player => player.userRole === "storyteller" || player.isAlive);
  const dead = shown.filter(player => player.userRole === "player" && !player.isAlive);
  const width = Math.min(96, (shown.length <= 2 ? 31 : 27) * CAMERA_SCALE);
  const columnCount = Math.min(3, Math.max(1, Math.floor(99 / (width + 3))));
  const centers = columnCount === 3 ? [18, 50, 82] : columnCount === 2 ? [25, 75] : [50];
  const host = alive.find(player => player.userRole === "storyteller") ?? alive[0];
  const focus = new Set(focusedPlayerIds);
  const remaining = alive.filter(player => player.id !== host?.id);
  const ordered = [
    ...remaining.filter(player => focus.has(player.id)),
    ...remaining.filter(player => !focus.has(player.id)),
  ];

  const livingRows = alive.length === 0 ? 0 : columnCount === 3
    ? Math.ceil(alive.length / 3)
    : 1 + Math.ceil(remaining.length / columnCount);
  const deadRows = Math.ceil(dead.length / columnCount);
  const rows = Math.max(1, livingRows + deadRows);
  const positions: Record<string, CameraPosition> = {};

  const place = (player: PublicPlayer, row: number, left: number) => {
    positions[player.id] = {
      left: `${left}%`,
      top: `${((row + 0.5) / rows) * 100}%`,
      width: `${width}%`,
    };
  };

  if (host) {
    if (columnCount === 3) {
      const centerRow = Math.floor((livingRows - 1) / 2);
      place(host, centerRow, 50);
      const slots = Array.from({ length: livingRows * 3 }, (_, index) => ({
        row: Math.floor(index / 3), col: index % 3,
      })).filter(slot => slot.row !== centerRow || slot.col !== 1);
      slots.sort((a, b) => {
        const distance = (slot: typeof a) =>
          Math.abs(slot.row - centerRow) * 3 + Math.abs(slot.col - 1);
        return distance(a) - distance(b) || a.row - b.row || a.col - b.col;
      });
      ordered.forEach((player, index) => {
        const slot = slots[index];
        if (slot) place(player, slot.row, centers[slot.col]);
      });
    } else {
      place(host, 0, 50);
      ordered.forEach((player, index) => {
        const row = 1 + Math.floor(index / columnCount);
        const inRow = Math.min(columnCount, ordered.length - (row - 1) * columnCount);
        const center = inRow === 1 ? 50 : centers[index % columnCount];
        place(player, row, center);
      });
    }
  }

  dead.forEach((player, index) => {
    const rowIndex = Math.floor(index / columnCount);
    const inRow = Math.min(columnCount, dead.length - rowIndex * columnCount);
    const col = index % columnCount;
    const center = inRow === 1 ? 50 : columnCount === 3 && inRow === 2
      ? [18, 82][col] : centers[col];
    place(player, livingRows + rowIndex, center);
  });

  return {
    positions,
    rows,
    rowHeight: `clamp(${124 * CAMERA_SCALE}px, ${19.5 * CAMERA_SCALE}vw, ${232 * CAMERA_SCALE}px)`,
    maxFrameWidth: `${360 * CAMERA_SCALE}px`,
  };
}
