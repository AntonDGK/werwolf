// Ellipse: alle Größen in Prozent der Szenenfläche.
export const CAMERA_ELLIPSE = {
  radiusX: 39,
  radiusY: 26,
  centerY: 61,
  cameraSize: 17,
  narratorSize: 13,
  narratorTop: 11,
  deadScale: 0.10,
  focusScale: 1.15,
  movingScale: 0.75,
  focusDurationMs: 650,
  focusGap: 2,
} as const;

export type CameraPoint = { x: number; y: number };
export type CameraEllipseResult = {
  positions: Record<string, CameraPoint>;
  narratorPosition: CameraPoint;
  cameraWidth: number;
  narratorWidth: number;
  cameraPercent: number;
  isLimited: boolean;
};

const HEIGHT_FACTOR = 9 / 16 + 0.15;
const MIN_GAP_PX = 8;

function rectanglesOverlap(a: CameraPoint, aw: number, b: CameraPoint, bw: number): boolean {
  return Math.abs(a.x - b.x) < (aw + bw) / 2 + MIN_GAP_PX &&
    Math.abs(a.y - b.y) < (aw + bw) * HEIGHT_FACTOR / 2 + MIN_GAP_PX;
}

export function calculateCameraEllipse(
  ids: readonly string[], width: number, height: number,
): CameraEllipseResult {
  const config = CAMERA_ELLIPSE;
  const count = ids.length;
  const positions: Record<string, CameraPoint> = {};
  ids.forEach((id, index) => {
    const angle = count === 1 ? Math.PI / 2 : -Math.PI / 2 + Math.PI / count + 2 * Math.PI * index / count;
    positions[id] = {
      x: width * (0.5 + config.radiusX / 100 * Math.cos(angle)),
      y: height * (config.centerY / 100 + config.radiusY / 100 * Math.sin(angle)),
    };
  });

  const wantedWidth = width * config.cameraSize / 100;
  const narratorWanted = width * config.narratorSize / 100;
  const points = Object.values(positions);
  const allowed = (cameraWidth: number) => {
    const narratorWidth = Math.min(narratorWanted, cameraWidth);
    const narrator = {
      x: width / 2,
      y: height * config.narratorTop / 100 + narratorWidth * HEIGHT_FACTOR / 2,
    };
    const fits = (point: CameraPoint, w: number) =>
      point.x - w / 2 >= MIN_GAP_PX && point.x + w / 2 <= width - MIN_GAP_PX &&
      point.y - w * HEIGHT_FACTOR / 2 >= MIN_GAP_PX &&
      point.y + w * HEIGHT_FACTOR / 2 <= height - MIN_GAP_PX;
    if (!fits(narrator, narratorWidth)) return false;
    for (let i = 0; i < points.length; i++) {
      if (!fits(points[i], cameraWidth) || rectanglesOverlap(points[i], cameraWidth, narrator, narratorWidth)) return false;
      for (let j = i + 1; j < points.length; j++) {
        if (rectanglesOverlap(points[i], cameraWidth, points[j], cameraWidth)) return false;
      }
    }
    return true;
  };

  let cameraWidth = wantedWidth;
  if (width > 0 && height > 0 && !allowed(cameraWidth)) {
    let low = 0;
    let high = cameraWidth;
    for (let i = 0; i < 26; i++) {
      const middle = (low + high) / 2;
      if (allowed(middle)) low = middle;
      else high = middle;
    }
    cameraWidth = low;
  }
  const narratorWidth = Math.min(narratorWanted, cameraWidth);
  return {
    positions,
    narratorPosition: {
      x: width / 2,
      y: height * config.narratorTop / 100 + narratorWidth * HEIGHT_FACTOR / 2,
    },
    cameraWidth,
    narratorWidth,
    cameraPercent: width ? cameraWidth / width * 100 : config.cameraSize,
    isLimited: cameraWidth < wantedWidth - 0.5,
  };
}

export type CameraObstacle = CameraPoint & { width: number };

export function calculateFocusTargets(
  ids: readonly string[], width: number, height: number, cameraWidth: number,
  obstacles: readonly CameraObstacle[] = [],
): Record<string, CameraPoint & { scale: number }> {
  const targets: Record<string, CameraPoint & { scale: number }> = {};
  if (!ids.length || cameraWidth <= 0) return targets;

  const config = CAMERA_ELLIPSE;
  const gap = width * config.focusGap / 100;
  let bestScale = 0;
  let best: CameraPoint[] = [];
  const positionsFor = (columns: number, scale: number, cx: number, cy: number): CameraPoint[] => {
    const rows = Math.ceil(ids.length / columns);
    const w = cameraWidth * scale;
    const stepX = w + gap;
    const stepY = w * HEIGHT_FACTOR + gap;
    return ids.map((_, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const rowCount = Math.min(columns, ids.length - row * columns);
      return {
        x: cx + (col - (rowCount - 1) / 2) * stepX,
        y: cy + (row - (rows - 1) / 2) * stepY,
      };
    });
  };
  const fits = (points: CameraPoint[], scale: number): boolean => {
    const w = cameraWidth * scale;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.x - w / 2 < MIN_GAP_PX || p.x + w / 2 > width - MIN_GAP_PX ||
          p.y - w * HEIGHT_FACTOR / 2 < MIN_GAP_PX ||
          p.y + w * HEIGHT_FACTOR / 2 > height - MIN_GAP_PX) return false;
      for (const obstacle of obstacles) {
        if (rectanglesOverlap(p, w, obstacle, obstacle.width)) return false;
      }
      for (let j = i + 1; j < points.length; j++) {
        if (rectanglesOverlap(p, w, points[j], w)) return false;
      }
    }
    return true;
  };

  for (let columns = 1; columns <= Math.min(4, ids.length); columns++) {
    for (const centerX of [0.5, 0.47, 0.53]) {
      for (const centerY of [0.59, 0.55, 0.63, 0.51, 0.67]) {
        const x = width * centerX;
        const y = height * centerY;
        let low = 0;
        let high: number = config.focusScale;
        for (let i = 0; i < 17; i++) {
          const middle = (low + high) / 2;
          if (fits(positionsFor(columns, middle, x, y), middle)) low = middle;
          else high = middle;
        }
        if (low > bestScale) {
          bestScale = low;
          best = positionsFor(columns, low, x, y);
        }
      }
    }
  }

  if (!best.length) {
    bestScale = 0.1;
    best = positionsFor(1, bestScale, width * 0.5, height * 0.6);
  }
  ids.forEach((id, index) => {
    targets[id] = { ...best[index], scale: bestScale };
  });
  return targets;
}
