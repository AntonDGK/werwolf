
export class ActionConfirmationManager {
  // Spieler, die ihre Aktion bestätigt haben
  private confirmedPlayers = new Set<string>();

  // Auswahl bestätigen
  confirm(playerId: string): void {
    this.confirmedPlayers.add(playerId);
  }

  // Hat der Spieler bereits bestätigt?
  isConfirmed(playerId: string): boolean {
    return this.confirmedPlayers.has(playerId);
  }

  // Bestätigung zurücksetzen
  unconfirm(playerId: string): void {
    this.confirmedPlayers.delete(playerId);
  }

  // Anzahl bestätigter Spieler ermitteln
  getConfirmedCount(eligiblePlayerIds: string[]): number {
    return eligiblePlayerIds.filter(id =>
      this.confirmedPlayers.has(id)
    ).length;
  }

  // Bei neuer Rollenphase zurücksetzen
  reset(): void {
    this.confirmedPlayers.clear();
  }
}
