import type { Player } from "../types/Player";
import { roleRegistry } from "./RoleRegistry";
import type {
  PublicRoleInfo, RoleDefinition, RoleId, RoleModule, RoleTiming, AbilityFrequency,
} from "./RoleTypes";

export type ScheduledRoleStep = {
  /** Example: werewolves, seer. May contain more than one role in the future. */
  id: string;
  order: number;
  roleIds: RoleId[];
};

export class RoleManager {
  private readonly roles = new Map<RoleId, RoleModule>();

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

  /** Only public descriptions: never any player-to-role assignments. */
  getPublicCatalog(): PublicRoleInfo[] {
    return Array.from(this.roles.values(), ({ config }) => ({
      id: config.id, name: config.name, description: config.description, frame: config.frame,
    }));
  }

  /** Only schedules roles that a living participant currently has. */
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
      const timing: RoleTiming | undefined = period === "night" ? role.night : role.day;
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
