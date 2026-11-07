export type GameSoundEvent = {
  id: string;
  volume: number;
};

export class GameSoundManager {
  constructor(private readonly emit: (receiverId: string, sound: GameSoundEvent) => void) {}

  play(id: string, receivers: readonly string[], volume = 1): void {
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(id) || !Number.isFinite(volume)) return;
    const event = { id, volume: Math.max(0, Math.min(1, volume)) };
    for (const receiverId of new Set(receivers)) this.emit(receiverId, event);
  }
}
