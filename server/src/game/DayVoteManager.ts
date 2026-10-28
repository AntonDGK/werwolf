export type VoteState = "idle" | "open" | "closed";
export type VoteAccount = { name: string };
export type VoteResult = { target: string; votes: number };
export type VoteWeight = (voterKey: string) => number;

type VoteTally = { key: string; votes: number };

export class DayVoteManager {
  private state: VoteState = "idle";
  private votes = new Map<string, string>();
  private finalTally: VoteTally[] | null = null;

  get currentState(): VoteState { return this.state; }
  get voteCount(): number { return this.votes.size; }

  reset(): void {
    this.state = "idle";
    this.votes.clear();
    this.finalTally = null;
  }

  start(): void {
    if (this.state !== "idle") return;
    this.state = "open";
    this.votes.clear();
    this.finalTally = null;
  }

  cast(voterKey: string, targetKey: string): void {
    if (this.state !== "open") return;
    if (this.votes.get(voterKey) === targetKey) this.votes.delete(voterKey);
    else this.votes.set(voterKey, targetKey);
  }

  close(accounts: ReadonlyMap<string, VoteAccount>, weightOf?: VoteWeight): void {
    if (this.state !== "open") return;
    this.finalTally = this.tally(accounts, weightOf);
    this.state = "closed";
  }

  repeat(accounts: ReadonlyMap<string, VoteAccount>): boolean {
    if (this.state !== "closed" || this.getUniqueWinner(accounts) !== null) return false;
    this.votes.clear();
    this.finalTally = null;
    this.state = "open";
    return true;
  }

  removeAccount(key: string): void {
    this.votes.delete(key);
    for (const [voter, target] of this.votes) {
      if (target === key) this.votes.delete(voter);
    }
  }

  getSelection(key: string, accounts: ReadonlyMap<string, VoteAccount>): string | null {
    const target = this.votes.get(key);
    return target ? accounts.get(target)?.name ?? null : null;
  }

  private tally(accounts: ReadonlyMap<string, VoteAccount>, weightOf?: VoteWeight): VoteTally[] {
    const counts = new Map<string, number>();
    for (const [voter, target] of this.votes) {
      if (!accounts.has(voter) || !accounts.has(target)) continue;
      const proposed = weightOf?.(voter) ?? 1;
      const weight = Number.isSafeInteger(proposed) && proposed >= 1 && proposed <= 10 ? proposed : 1;
      counts.set(target, (counts.get(target) ?? 0) + weight);
    }
    return [...counts.entries()]
      .map(([key, votes]) => ({ key, votes }))
      .sort((a, b) => b.votes - a.votes ||
        (accounts.get(a.key)?.name ?? "").localeCompare(accounts.get(b.key)?.name ?? "", "de"));
  }

  getUniqueWinner(accounts: ReadonlyMap<string, VoteAccount>, weightOf?: VoteWeight): string | null {
    if (this.state !== "closed") return null;
    const results = this.finalTally ?? this.tally(accounts, weightOf);
    if (!results.length || (results[1] && results[0].votes === results[1].votes)) return null;
    return accounts.has(results[0].key) ? results[0].key : null;
  }

  getSharedStatus(
    voterCount: number,
    accounts: ReadonlyMap<string, VoteAccount>,
    isGamemaster = false,
    weightOf?: VoteWeight,
  ) {
    const isRevealed = this.state === "closed";
    const canSeeCounts = isRevealed || isGamemaster;
    const winnerKey = isRevealed ? this.getUniqueWinner(accounts, weightOf) : null;
    const results = canSeeCounts && this.state !== "idle"
      ? (this.finalTally ?? this.tally(accounts, weightOf))
          .map(({ key, votes }) => ({ target: accounts.get(key)?.name ?? "Spieler", votes }))
      : [];
    return {
      state: this.state,
      votesCast: canSeeCounts ? this.votes.size : 0,
      eligibleVoters: canSeeCounts ? voterCount : 0,
      results,
      winner: winnerKey ? accounts.get(winnerKey)?.name ?? null : null,
      canRepeat: isRevealed && winnerKey === null,
    };
  }
}
