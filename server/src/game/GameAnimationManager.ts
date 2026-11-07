import { randomUUID } from "crypto";

export type GameAnimationType = "cupid-arrow" | "player-death";

export type GameAnimationEvent = {
  id: string;
  type: GameAnimationType;
  sourcePlayerId?: string;
  targetPlayerIds: string[];
  durationMs: number;
};

export class GameAnimationManager {
  constructor(private readonly send: (socketId: string, event: GameAnimationEvent) => void) {}

  play(
    type: GameAnimationType,
    targetPlayerIds: readonly string[],
    viewerSocketIds: readonly string[],
    sourcePlayerId?: string,
  ): void {
    const targets = [...new Set(targetPlayerIds.filter(Boolean))];
    if (!targets.length) return;
    const event: GameAnimationEvent = {
      id: randomUUID(),
      type,
      targetPlayerIds: targets,
      durationMs: type === "cupid-arrow" ? 1800 : 1200,
      ...(sourcePlayerId ? { sourcePlayerId } : {}),
    };
    for (const socketId of new Set(viewerSocketIds.filter(Boolean))) this.send(socketId, event);
  }
}
