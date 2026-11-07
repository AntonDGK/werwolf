export type LoverPair = readonly [string, string];

export class RelationshipManager {
  private pair: LoverPair | null = null;

  setLovers(first: string, second: string): boolean {
    if (this.pair || !first || !second || first === second) return false;
    this.pair = [first, second];
    return true;
  }

  getLovers(): LoverPair | null {
    return this.pair;
  }

  getPartner(playerId: string): string | null {
    if (!this.pair) return null;
    if (this.pair[0] === playerId) return this.pair[1];
    if (this.pair[1] === playerId) return this.pair[0];
    return null;
  }

  cascadeDeaths(
    deaths: readonly { targetId: string; reason: string }[],
    players: readonly { id: string; isAlive: boolean }[],
  ): { targetId: string; reason: string }[] {
    const casualties = new Map(deaths.map(death => [death.targetId, death.reason]));
    for (const id of [...casualties.keys()]) {
      const partner = this.getPartner(id);
      if (partner && players.some(p => p.id === partner && p.isAlive) && !casualties.has(partner)) {
        casualties.set(partner, "lovers");
      }
    }
    return [...casualties].map(([targetId, reason]) => ({ targetId, reason }));
  }

  reset(): void {
    this.pair = null;
  }
}
