import type { PublicPlayer } from "../types/Player";

// Größenfaktoren
export const CAMERA_SCALE = 1.4;
export const CAMERA_SCALE_SMALL = 1.1;
const SIDE_MARGIN = 15;
const SPACING = 1.2;

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

type Row = { players: PublicPlayer[]; host?: PublicPlayer; dead: boolean };
type Tile = { player: PublicPlayer; center: number; relativeScale: number; row: number };

function rowSizes(living: number, availableRows: number): number[] {
  if (!living || availableRows <= 0) return [];
  if (availableRows === 1 || living <= 3) return [living];
  if (availableRows >= 3 && living >= 7) {
    if (living === 7) return [1, 3, 3];
    if (living === 8) return [2, 3, 3];
    return [3, 3, living - 6];
  }
  if (living === 4) return [2, 2];
  if (living === 5) return [3, 2];
  if (living === 6) return [3, 3];
  if (living === 7) return [3, 4];
  return [4, living - 4];
}

function centers(count: number, host: boolean): number[] {
  if (host) {
    if (count === 1) return [50];
    if (count === 2) return [30, 50];
    if (count === 3) return [27, 50, 73];
    if (count === 4) return [22, 36, 50, 78];
    return [22, 36, 50, 64, 78];
  }
  if (count === 1) return [50];
  if (count === 2) return [35, 65];
  if (count === 3) return [27, 50, 73];
  if (count === 4) return [22, 40.5, 59.5, 78];
  return [22, 36, 50, 64, 78];
}

export function calculateCameraLayout(
  players: readonly PublicPlayer[],
  focusedPlayerIds: readonly string[] = [],
): CameraLayout {
  const shown = players.filter(player => player.userRole !== "gamemaster");
  const alive = shown.filter(player => player.userRole === "storyteller" || player.isAlive);
  const dead = shown.filter(player => player.userRole === "player" && !player.isAlive);
  const host = alive.find(player => player.userRole === "storyteller") ?? alive[0];
  const highlighted = new Set(focusedPlayerIds.filter(id => id !== host?.id));
  const hasHighlight = alive.some(player => highlighted.has(player.id));
  const otherAlive = alive.filter(player => player.id !== host?.id);
  const ordered = [
    ...otherAlive.filter(player => highlighted.has(player.id)),
    ...otherAlive.filter(player => !highlighted.has(player.id)),
  ];

  // Tote: höchstens vier pro Reihe.
  const deadRows = Math.ceil(dead.length / 4);
  const livingSizes = rowSizes(alive.length, Math.max(0, 3 - deadRows));
  const rows: Row[] = livingSizes.map(() => ({ players: [], dead: false }));

  if (host && rows.length) {
    rows[0].host = host;
    rows[0].players = ordered.splice(0, livingSizes[0] - 1);
  } else if (rows.length) {
    rows[0].players = ordered.splice(0, livingSizes[0]);
  }
  for (let index = 1; index < rows.length; index++) {
    rows[index].players = ordered.splice(0, livingSizes[index]);
  }
  for (let index = 0; index < deadRows; index++) {
    rows.push({ players: dead.slice(index * 4, (index + 1) * 4), dead: true });
  }

  const rowCount = Math.max(1, rows.length);
  const tiles: Tile[] = [];

  rows.forEach((row, index) => {
    const all = row.host ? [row.host, ...row.players] : row.players;
    const points = centers(all.length, Boolean(row.host));
    if (row.host) {
      tiles.push({ player: row.host, center: 50, relativeScale: 1, row: index });
      const others = points.filter(value => value !== 50)
        .sort((a, b) => Math.abs(a - 50) - Math.abs(b - 50) || a - b);
      row.players.forEach((player, i) => tiles.push({
        player,
        center: others[i],
        relativeScale: hasHighlight && !highlighted.has(player.id) ? CAMERA_SCALE_SMALL / CAMERA_SCALE : 1,
        row: index,
      }));
    } else {
      row.players.forEach((player, i) => tiles.push({
        player,
        center: points[i],
        relativeScale: hasHighlight && !row.dead && !highlighted.has(player.id) ? CAMERA_SCALE_SMALL / CAMERA_SCALE : 1,
        row: index,
      }));
    }
  });

  // Breite an Nachbarn und 70-%-Bereich anpassen.
  let widthLimit = 22 * CAMERA_SCALE / 1.4;
  for (const tile of tiles) {
    widthLimit = Math.min(widthLimit,
      2 * (tile.center - SIDE_MARGIN) - SPACING,
      2 * (100 - SIDE_MARGIN - tile.center) - SPACING);
  }
  for (let index = 0; index < rows.length; index++) {
    const rowTiles = tiles.filter(tile => tile.row === index).sort((a, b) => a.center - b.center);
    for (let i = 1; i < rowTiles.length; i++) {
      const previous = rowTiles[i - 1];
      const current = rowTiles[i];
      widthLimit = Math.min(widthLimit, current.center - previous.center - SPACING);
    }
  }
  const baseWidth = Math.max(0, widthLimit);
  // 16:9-Kamerabild + Namenszeile.
  const heightWidth = 100 * 16 / (9 * rowCount);
  const positions: Record<string, CameraPosition> = {};
  for (const tile of tiles) {
    const ratio = tile.relativeScale;
    positions[tile.player.id] = {
      left: `${tile.center}%`,
      top: `${((tile.row + 0.5) / rowCount) * 100}%`,
      width: `min(${(baseWidth * ratio).toFixed(3)}%, max(0px, calc(${(heightWidth * ratio).toFixed(3)}cqh - ${(40 * ratio).toFixed(1)}px)))`,
    };
  }

  return {
    positions,
    rows: rowCount,
    rowHeight: `calc(100% / ${rowCount})`,
    maxFrameWidth: `${360 * CAMERA_SCALE}px`,
  };
}
