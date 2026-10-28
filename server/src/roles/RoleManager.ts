import type { Player } from "../types/Player";
import { roleRegistry } from "./RoleRegistry";
import { villagerConfig } from "./villager/config";
import { canRoleTarget } from "./canTarget";
import { ActionConfirmationManager } from "./ActionConfirmationManager";
import type { NightStateManager } from "./NightStateManager";
import type {
  AbilityFrequency,
  PublicRoleInfo,
  NotebookRoleInfo,
  RoleActionPhase,
  RoleActionPlayer,
  RoleActionResult,
  RoleButton,
  RoleButtonState,
  RoleDefinition,
  RoleEffect,
  RoleId,
  RoleModule,
  RoleNightInfo,
  RoleTiming,
} from "./RoleTypes";

export type ScheduledRoleStep = {
  id: string;
  order: number;
  roleIds: RoleId[];
};

export class RoleManager {
  private readonly roles = new Map<RoleId, RoleModule>();
  private readonly confirmations = new ActionConfirmationManager();
  private readonly completedConfirmations = new Map<RoleId, Set<string>>();
  private readonly usedButtons = new Set<string>();
  private readonly publicFrames = new Map<string, RoleId>();

  constructor(entries: Record<string, RoleModule> = roleRegistry) {
    for (const [key, entry] of Object.entries(entries)) {
      if (key !== entry.config.id || !key.trim() || this.roles.has(key)) {
        throw new Error(`Ungültige oder doppelte Rollen-ID: ${key}`);
      }
      this.roles.set(key, entry);
    }
  }

  isValidRoleId(input: unknown): input is RoleId {
    return typeof input === "string" && this.roles.has(input);
  }

  getRole(id: RoleId): RoleModule | undefined {
    return this.roles.get(id);
  }

  getPublicCatalog(): PublicRoleInfo[] {
    return Array.from(this.roles.values(), ({ config }) => ({
      id: config.id,
      name: config.name,
      description: config.description,
      frame: config.frame,
    }));
  }

  getNotebookEntries(assignedRoles: readonly (RoleId | null)[]): NotebookRoleInfo[] {
    const ids = new Set(assignedRoles.map(id => id ?? "villager"));
    return [...ids].flatMap(id => {
      const config = id === "villager" ? villagerConfig : this.roles.get(id)?.config;
      if (!config) return [];
      return [{
        id: config.id,
        name: config.name,
        description: config.notebook?.description ?? config.description,
      }];
    }).sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  getFrameFilename(roleId: RoleId | null): string | null {
    return roleId ? this.roles.get(roleId)?.config.frame ?? null : null;
  }

  getVisibleFrame(
    viewer: RoleActionPlayer | null,
    target: RoleActionPlayer,
  ): string | null {
    if (target.userRole !== "player" || !target.gameRole) return null;
    const config = this.roles.get(target.gameRole)?.config;
    if (!config) return null;
    if (viewer?.id === target.id && viewer.userRole === "player") return config.frame;
    if (config.frameVisibility?.publicOnReveal && this.publicFrames.get(target.id) === target.gameRole) return config.frame;
    if (viewer?.userRole !== "player" || !viewer.gameRole) return null;
    if (viewer.gameRole === target.gameRole && config.frameVisibility?.sameRole) return config.frame;
    if (config.frameVisibility?.visibleToRoles?.includes(viewer.gameRole)) return config.frame;
    return null;
  }

  publishFrameOnReveal(targetId: string, roleId: RoleId | null): void {
    if (roleId && this.roles.get(roleId)?.config.frameVisibility?.publicOnReveal) {
      this.publicFrames.set(targetId, roleId);
    }
  }

  select(
    actor: RoleActionPlayer,
    target: RoleActionPlayer,
    phase: RoleActionPhase,
  ): RoleActionResult {
    const role = this.getActiveRole(actor, phase);
    if (!role) return { ok: false, reason: "Rolle ist nicht aktiv." };
    if (target.userRole !== "player") return { ok: false, reason: "Ungültiges Ziel." };
    if (this.confirmations.isConfirmed(actor.id)) {
      return { ok: false, reason: "Auswahl bereits bestätigt." };
    }
    if (!canRoleTarget(role.config, actor, target)) {
      return { ok: false, reason: "Ziel nicht erlaubt." };
    }
    if (!role.actions.select) {
      return { ok: false, reason: "Rolle unterstützt keine Auswahl." };
    }
    return role.actions.select({ actorId: actor.id, targetId: target.id, round: phase.round });
  }

  getActionState(
    actor: RoleActionPlayer,
    phase: RoleActionPhase,
    targets: readonly RoleActionPlayer[],
    nightState?: NightStateManager,
  ) {
    const role = this.getActiveRole(actor, phase);
    if (!role) {
      return {
        active: false, requiresConfirmation: false, confirmed: false,
        selectionId: null as string | null, allowedTargetIds: [] as string[],
        buttons: [] as RoleButtonState[], nightInfo: null as RoleNightInfo | null,
      };
    }

    const confirmed = this.confirmations.isConfirmed(actor.id);
    const selectionId = role.actions.getSelection?.(actor.id) ?? null;
    const buttons = (role.config.buttons?.[phase.period] ?? []).map(button =>
      this.buttonState(role.config, button, actor, phase, confirmed, selectionId));

    return {
      active: true,
      requiresConfirmation: role.config.selection?.requiresConfirmation === true,
      confirmed,
      selectionId,
      allowedTargetIds: confirmed || !role.actions.select ? [] : targets
        .filter(target => target.userRole === "player" && canRoleTarget(role.config, actor, target))
        .map(target => target.id),
      buttons,
      nightInfo: phase.period === "night" ? this.nightInfoFor(role, nightState) ?? null : null,
    };
  }

  triggerButton(
    actor: RoleActionPlayer,
    phase: RoleActionPhase,
    buttonId: string,
    nightState?: NightStateManager,
  ): RoleActionResult {
    const role = this.getActiveRole(actor, phase);
    if (!role) return { ok: false, reason: "Rolle ist nicht aktiv." };
    const button = role.config.buttons?.[phase.period]?.find(b => b.id === buttonId);
    if (!button) return { ok: false, reason: "Aktion ist nicht verfügbar." };
    const selectionId = role.actions.getSelection?.(actor.id) ?? null;
    const state = this.buttonState(role.config, button, actor, phase,
      this.confirmations.isConfirmed(actor.id), selectionId);
    if (state.disabled) return { ok: false, reason: "Aktion derzeit nicht erlaubt." };

    if (button.kind === "confirm") return this.confirm(actor, phase);

    const handler = phase.period === "night" ? role.actions.onNightAction : role.actions.onDayAction;
    if (!handler) return { ok: false, reason: "Aktion nicht implementiert." };
    const result = handler({ actorId: actor.id, actionId: button.id,
      targetId: selectionId ?? undefined, round: phase.round,
      night: phase.period === "night" ? this.nightInfoFor(role, nightState) : undefined });
    if (result.ok && (button.once || role.config[phase.period]?.frequency === "once")) {
      this.usedButtons.add(this.buttonKey(role.config.id, phase.period, button.id, actor.id));
    }
    return result;
  }

  confirm(actor: RoleActionPlayer, phase: RoleActionPhase): RoleActionResult {
    const role = this.getActiveRole(actor, phase);
    if (!role) return { ok: false, reason: "Rolle ist nicht aktiv." };
    if (!role.config.selection?.requiresConfirmation) {
      return { ok: false, reason: "Keine Bestätigung erforderlich." };
    }
    if (this.confirmations.isConfirmed(actor.id)) {
      return { ok: false, reason: "Bereits bestätigt." };
    }
    if (!role.actions.getSelection?.(actor.id)) {
      return { ok: false, reason: "Noch kein Ziel ausgewählt." };
    }
    this.confirmations.confirm(actor.id);
    return { ok: true };
  }

  getConfirmationProgress(
    players: readonly RoleActionPlayer[],
    phase: RoleActionPhase,
  ): { confirmed: number; total: number } {
    const eligible = players.filter(player => {
      const role = this.getActiveRole(player, phase);
      return role?.config.selection?.requiresConfirmation === true;
    });
    return {
      confirmed: this.confirmations.getConfirmedCount(eligible.map(p => p.id)),
      total: eligible.length,
    };
  }

  // Bestätigungen sichern
  completeStep(phase: RoleActionPhase, players: readonly RoleActionPlayer[]): void {
    for (const player of players) {
      const role = this.getActiveRole(player, phase);
      if (!role || !this.confirmations.isConfirmed(player.id)) continue;
      const confirmed = this.completedConfirmations.get(role.config.id) ?? new Set<string>();
      confirmed.add(player.id);
      this.completedConfirmations.set(role.config.id, confirmed);
    }
  }

  runNightStepEnd(
    phase: RoleActionPhase,
    players: readonly RoleActionPlayer[],
    nightState: NightStateManager,
  ): RoleEffect[] {
    if (phase.period !== "night" || phase.stepId === null) return [];
    const roleIds = new Set(players
      .filter(player => this.getActiveRole(player, phase))
      .map(player => player.gameRole as string));
    const effects: RoleEffect[] = [];
    for (const id of roleIds) {
      const role = this.roles.get(id);
      if (!role?.actions.onNightStepEnd) continue;
      effects.push(...role.actions.onNightStepEnd({
        round: phase.round,
        players,
        confirmedActorIds: this.completedConfirmations.get(id) ?? new Set<string>(),
        night: this.nightInfoFor(role, nightState),
      }));
    }
    return effects;
  }

  runEvent(
    event: "onNightStart" | "onNightEnd" | "onDayStart" | "onDayEnd",
    players: readonly RoleActionPlayer[],
    round: number,
    nightState?: NightStateManager,
  ): RoleEffect[] {
    const period = event === "onNightStart" || event === "onNightEnd" ? "night" : "day";
    const participatingRoles = new Set(players
      .filter(p => p.userRole === "player" && p.isAlive && p.gameRole)
      .map(p => p.gameRole as string));
    const effects: RoleEffect[] = [];

    for (const roleId of participatingRoles) {
      const role = this.roles.get(roleId);
      const timing = role?.config[period];
      if (!role || !timing?.enabled ||
          (timing.frequency === "first-night" && round !== 1)) continue;
      const handler = role.actions[event];
      if (!handler) continue;
      effects.push(...handler({
        round,
        players,
        confirmedActorIds: this.completedConfirmations.get(roleId) ?? new Set<string>(),
        night: period === "night" ? this.nightInfoFor(role, nightState) : undefined,
      }));
    }
    return effects;
  }

  getDayVoteWeight(voter: RoleActionPlayer): number {
    if (voter.userRole !== "player" || !voter.isAlive || !voter.gameRole) return 1;
    const weight = this.roles.get(voter.gameRole)?.actions.getDayVoteWeight?.(voter.id) ?? 1;
    return Number.isSafeInteger(weight) && weight >= 1 && weight <= 10 ? weight : 1;
  }

  notifyDeath(player: RoleActionPlayer): void {
    if (player.userRole === "player" && player.gameRole) {
      this.roles.get(player.gameRole)?.actions.onDeath?.(player.id);
    }
  }

  resetConfirmations(): void {
    this.confirmations.reset();
  }

  resetRoleActions(): void {
    this.resetConfirmations();
    this.completedConfirmations.clear();
    for (const role of this.roles.values()) role.actions.reset?.();
  }

  resetGame(): void {
    this.publicFrames.clear();
    this.resetRoleActions();
    this.usedButtons.clear();
    for (const role of this.roles.values()) role.actions.onGameReset?.();
  }

  private nightInfoFor(
    role: RoleModule,
    nightState?: NightStateManager,
  ): RoleNightInfo | undefined {
    if (!role.config.night?.canSeeWerewolfTarget || !nightState) return undefined;
    return { werewolfTargetId: nightState.getWerewolfTargetId() };
  }

  private buttonKey(roleId: string, period: string, buttonId: string, playerId: string): string {
    return `${roleId}:${period}:${buttonId}:${playerId}`;
  }

  private buttonState(
    role: RoleDefinition,
    button: RoleButton,
    actor: RoleActionPlayer,
    phase: RoleActionPhase,
    confirmed: boolean,
    selectionId: string | null,
  ): RoleButtonState {
    const used = (button.once || role[phase.period]?.frequency === "once") &&
      this.usedButtons.has(this.buttonKey(role.id, phase.period, button.id, actor.id));
    const isConfirmed = button.kind === "confirm" && confirmed;
    const requiresSelection = button.kind === "confirm" || button.requiresSelection === true;
    return {
      id: button.id,
      label: isConfirmed ? (button.confirmedLabel ?? button.label) :
        used ? (button.usedLabel ?? button.label) : button.label,
      disabled: Boolean(used || isConfirmed || (requiresSelection && !selectionId)),
    };
  }

  private getActiveRole(
    actor: RoleActionPlayer,
    phase: RoleActionPhase,
  ): RoleModule | null {
    if (actor.userRole !== "player" || !actor.isAlive || !actor.gameRole) return null;
    const role = this.getRole(actor.gameRole);
    if (!role) return null;
    const timing = role.config[phase.period];
    if (!timing?.enabled) return null;
    if (timing.frequency === "first-night" && (phase.period !== "night" || phase.round !== 1)) {
      return null;
    }
    if (timing.separatePhase) {
      if ((timing.phaseGroup || role.config.id) !== phase.stepId) return null;
    } else if (phase.stepId !== null) {
      return null;
    }
    return role;
  }

  createSteps(
    period: "night" | "day",
    round: number,
    players: readonly Pick<Player, "userRole" | "gameRole" | "isAlive">[],
    usedOnce: ReadonlySet<string> = new Set(),
  ): ScheduledRoleStep[] {
    const found = new Map<string, ScheduledRoleStep>();
    for (const player of players) {
      if (!player.isAlive || player.userRole === "gamemaster" || player.gameRole === null) continue;
      const role = this.getRole(player.gameRole)?.config;
      if (!role) continue;
      const timing: RoleTiming | undefined = role[period];
      if (!timing?.enabled || !timing.separatePhase) continue;
      if (!this.frequencyAllows(timing.frequency, round, usedOnce, period, role.id)) continue;
      const group = timing.phaseGroup || role.id;
      const entry = found.get(group);
      const order = timing.order ?? 100;
      if (entry) {
        if (!entry.roleIds.includes(role.id)) entry.roleIds.push(role.id);
        entry.order = Math.min(entry.order, order);
      } else {
        found.set(group, { id: group, order, roleIds: [role.id] });
      }
    }
    return Array.from(found.values()).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  private frequencyAllows(
    frequency: AbilityFrequency | undefined,
    round: number,
    usedOnce: ReadonlySet<string>,
    period: "night" | "day",
    roleId: string,
  ): boolean {
    if (frequency === "first-night") return period === "night" && round === 1;
    if (frequency === "once") return !usedOnce.has(`${period}:${roleId}`);
    return true;
  }
}
