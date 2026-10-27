export type VoteState = "idle" | "open" | "closed" | "resolved";
export type VoteAccount = { name: string };
export type VoteResult = { target: string; votes: number };

/**
 * Abstimmung fuer das ganze Dorf, unabhaengig von Rollenplugins.
 * Entscheidungen und Phasenwechsel passieren nur durch explizite
 * Spielleiter-Aktionen. Keine automatische Eliminierung.
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
    this.state = "open";
    this.votes.clear();
  }

  cast(voterKey: string, targetKey: string): void {
    if (this.state !== "open") return;
    this.votes.set(voterKey, targetKey); // eine Stimme pro Konto, aenderbar
  }

  close(): void {
    if (this.state === "open") this.state = "closed";
  }

  resolve(): void {
    if (this.state === "closed") this.state = "resolved";
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
    for (const [key, value] of accounts) {
      if (value.name === results[0].target) return key;
    }
    return null;
  }

  getSharedStatus(voterCount: number, accounts: ReadonlyMap<string, VoteAccount>) {
    // Nur aggregierte Stimmenzahlen (niemals Wähleridentitäten) veröffentlichen.
    // Die Icons am Kamerarahmen aktualisieren sich während der offenen Tageswahl.
    const results = this.state === "idle" ? [] : this.tally(accounts);
    const uniqueWinner = this.state === "closed" ? this.getUniqueWinner(accounts) : null;
    return {
      state: this.state,
      votesCast: this.votes.size,
      eligibleVoters: voterCount,
      results, // Aggregierte Stimmen schon waehrend offener Abstimmung sichtbar
      winner: uniqueWinner ? accounts.get(uniqueWinner)?.name ?? null : null,
    };
  }
}
