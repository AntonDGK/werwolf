/** Stable role identifiers, checked against the registry at runtime. */
export type RoleId = string;
export type AbilityFrequency = "every-night" | "every-day" | "first-night" | "once";

export type RoleTiming = {
  /** Without enabled there is no action at this time of day. */
  enabled: boolean;
  /** If true, the phase manager schedules a separate step. */
  separatePhase: boolean;
  order?: number;
  frequency?: AbilityFrequency;
  /** Several players sharing the same phaseGroup act within one step. */
  phaseGroup?: string;
};

export type RoleCameraLayout = {
  night?: {
    active?: {
      enabled: boolean;
      target: "same-role";
      layout: "dynamic";
      area: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    };
  };
};

export type RoleDefinition = {
  cameraLayout?: RoleCameraLayout;
  id: RoleId;
  name: string;
  description: string;
  /** File suffix for frame-<name>.png in client/src/assets/frames. */
  frame: string;
  night?: RoleTiming;
  day?: RoleTiming;
};

export type RoleActionContext = {
  actorId: string;
  targetId?: string;
  round: number;
};
export type RoleActionResult = { ok: true } | { ok: false; reason: string };

/** These hooks are reserved; nobody can invoke them over a socket yet. */
export type RoleActions = {
  onNightAction?: (context: RoleActionContext) => RoleActionResult;
  onDayAction?: (context: RoleActionContext) => RoleActionResult;
  onDeath?: (playerId: string) => void;
};

export type RoleModule = { config: RoleDefinition; actions: RoleActions };
export type PublicRoleInfo = Pick<RoleDefinition, "id" | "name" | "description" | "frame">;
