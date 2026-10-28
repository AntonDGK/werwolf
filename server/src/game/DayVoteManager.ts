export type VoteState = "idle" | "open" | "closed";
export type VoteAccount = { name: string };
export type VoteResult = { target: string; votes: number };

/**
 * Ein Tag hat genau drei Abschnitte:
 * idle = Diskussion, open = GEHEIME Wahl, closed = veröffentlichtes Ergebnis.
 * Der Erzähler/Gamemaster schaltet ausschließlich explizit weiter.
 */
export class DayVoteManager {
  private state: VoteState = "idle";
  private votes = new Map<string, string>(); // voterAccountKey -> targetAccountKey

  get currentState(): VoteState { return this.state; }
  get voteCount(): number { return this.votes.size; }

  reset(): void {
    this.state = "idle";
    this.votes.clear();
  }

  start(): void {
    if (this.state !== "idle") return;
    this.state = "open";
    this.votes.clear();
  }

  cast(voterKey: string, targetKey: string): void {
    if (this.state !== "open") return;
    // Zweiter Klick auf dasselbe Ziel zieht die Stimme zurück.
    if (this.votes.get(voterKey) === targetKey) {
      this.votes.delete(voterKey);
    } else {
      this.votes.set(voterKey, targetKey);
    }
  }

  close(): void {
    if (this.state === "open") this.state = "closed";
  }

  /** Nur nach einem Ergebnis OHNE eindeutigen Sieger wiederholen. */
  repeat(accounts: ReadonlyMap<string, VoteAccount>): boolean {
    if (this.state !== "closed" || this.getUniqueWinner(accounts) !== null) return false;
    this.votes.clear();
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

  private tally(accounts: ReadonlyMap<string, VoteAccount>): VoteResult[] {
    const counts = new Map<string, number>();
    for (const [voter, target] of this.votes) {
      if (!accounts.has(voter) || !accounts.has(target)) continue;
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, votes]) => ({ target: accounts.get(key)!.name, votes }))
      .sort((a, b) => b.votes - a.votes || a.target.localeCompare(b.target, "de"));
  }

  getUniqueWinner(accounts: ReadonlyMap<string, VoteAccount>): string | null {
    if (this.state !== "closed") return null;
    const results = this.tally(accounts);
    if (!results.length || (results[1] && results[0].votes === results[1].votes)) return null;
    for (const [key, account] of accounts) {
      if (account.name === results[0].target) return key;
    }
    return null;
  }

  /**
   * Im offenen Zustand nur fuer den Gamemaster Zahlen senden.
   * Alle anderen (inkl. Erzaehler) bekommen weder Live-Ergebnisse noch
   * Gesamtzahl der abgegebenen Stimmen. Erst CLOSED veroeffentlicht Zahlen.
   */
  getSharedStatus(
    voterCount: number,
    accounts: ReadonlyMap<string, VoteAccount>,
    isGamemaster = false,
  ) {
    const isRevealed = this.state === "closed";
    const canSeeCounts = isRevealed || isGamemaster;
    const winnerKey = isRevealed ? this.getUniqueWinner(accounts) : null;
    return {
      state: this.state,
      votesCast: canSeeCounts ? this.votes.size : 0,
      eligibleVoters: canSeeCounts ? voterCount : 0,
      results: canSeeCounts && this.state !== "idle" ? this.tally(accounts) : [],
      winner: winnerKey ? accounts.get(winnerKey)?.name ?? null : null,
      canRepeat: isRevealed && winnerKey === null,
    };
  }
}
