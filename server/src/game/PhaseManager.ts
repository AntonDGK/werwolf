import type { GamePhase } from "../types/Types";
import type { Player } from "../types/Player";
import { RoleManager, type ScheduledRoleStep } from "../roles/RoleManager";

export type PhaseStatus = {
  phase: GamePhase;
  round: number;
  /** The step ID is for GM/storyteller only; not public. */
  step: string | null;
};

/** One in-memory game. No DB. No ability execution until explicitly implemented. */
export class PhaseManager {
  private phase: GamePhase = "lobby";
  private round = 0;
  private steps: ScheduledRoleStep[] = [];
  private stepIndex = -1;
  private usedOnce = new Set<string>();

  constructor(private readonly roleManager: RoleManager) {}

  get currentPhase(): GamePhase { return this.phase; }

  // Nur serverintern: Welche Rollen sind gerade aktiv?
  // Der Rollenabschnitt selbst bleibt für Spieler geheim.
  getActiveRoleIds(): readonly string[] {
    return this.phase === "night" ? (this.steps[this.stepIndex]?.roleIds ?? []) : [];
  }

  /** Nur fuer die Steuerungsansicht: Rollenabschnitte der laufenden/naechsten Nacht. */
  getNightTimeline(players: readonly Player[]): ScheduledRoleStep[] {
    if (this.phase === "night") return this.steps;
    return this.roleManager.createSteps("night", this.round + 1, players, this.usedOnce);
  }

  getStatus(): PhaseStatus {
    return { phase: this.phase, round: this.round, step: this.steps[this.stepIndex]?.id ?? null };
  }

  setPhase(next: GamePhase, players: readonly Player[]): PhaseStatus {
    if (next === this.phase) return this.getStatus();
    if (next === "lobby") {
      this.round = 0;
      this.usedOnce.clear();
    }
    if (next === "night") this.round++;
    this.phase = next;
    this.stepIndex = -1;
    this.steps = next === "night" || next === "day"
      ? this.roleManager.createSteps(next, this.round, players, this.usedOnce)
      : [];
    return this.getStatus();
  }

  /** Next role step. A step ends only when a controller advances again. */
  nextStep(): PhaseStatus {
    if (this.phase !== "night" && this.phase !== "day") return this.getStatus();
    const current = this.steps[this.stepIndex];
    if (current) {
      for (const roleId of current.roleIds) {
        const frequency = this.roleManager.getRole(roleId)?.config[this.phase]?.frequency;
        if (frequency === "once") this.usedOnce.add(`${this.phase}:${roleId}`);
      }
    }
    this.stepIndex = Math.min(this.stepIndex + 1, this.steps.length);
    return this.getStatus();
  }
}
