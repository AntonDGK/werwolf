import type { RoleEffect } from "./RoleTypes";

export class NightStateManager {
  private readonly effects: RoleEffect[] = [];
  private readonly completedSteps = new Set<string>();

  reset(): void {
    this.effects.length = 0;
    this.completedSteps.clear();
  }

  record(effects: readonly RoleEffect[]): void {
    this.effects.push(...effects);
  }

  completeStep(stepId: string, run: () => readonly RoleEffect[]): boolean {
    if (this.completedSteps.has(stepId)) return false;
    const effects = run();
    this.completedSteps.add(stepId);
    this.record(effects);
    return true;
  }

  getWerewolfTargetId(): string | null {
    const attack = this.effects.find(
      (effect) => effect.type === "eliminate" && effect.reason === "werewolf",
    );
    return attack?.targetId ?? null;
  }

  getEffects(): readonly RoleEffect[] {
    return [...this.effects];
  }
}
