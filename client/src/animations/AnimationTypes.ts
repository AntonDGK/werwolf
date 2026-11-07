export type GameAnimationType = "cupid-arrow" | "player-death";

export type GameAnimationEvent = {
  id: string;
  type: GameAnimationType;
  sourcePlayerId?: string;
  targetPlayerIds: string[];
  durationMs: number;
};

export type Position = { x: number; y: number };
export type Target = Position & { width: number; height: number };
export type VisibleAnimation = GameAnimationEvent & { source: Position; targets: Target[] };
