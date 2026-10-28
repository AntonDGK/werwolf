export type RoleId = string;
export type AbilityFrequency = "every-night" | "every-day" | "first-night" | "once";
export type RoleActionPeriod = "night" | "day";

export type RoleTiming = {
  enabled: boolean;
  separatePhase: boolean;
  order?: number;
  frequency?: AbilityFrequency;
  phaseGroup?: string;
  canSeeWerewolfTarget?: boolean;
};

export type RoleTargeting = {
  allowSelfTarget?: boolean;
  allowSameRoleTarget?: boolean;
  onlyAliveTargets?: boolean;
};

export type RoleCameraLayout = {
  night?: {
    active?:
      | {
          target: "self" | "same-role";
          mode: "center";
        }
      | {
          enabled: boolean;
          target: "self" | "same-role";
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

export type RoleSelection = {
  requiresConfirmation?: boolean;
};

export type RoleButton = {
  id: string;
  label: string;
  kind?: "action" | "confirm";
  confirmedLabel?: string;
  usedLabel?: string;
  once?: boolean;
  requiresSelection?: boolean;
};

export type RoleButtonState = {
  id: string;
  label: string;
  disabled: boolean;
};

export type RoleFrameVisibility = {
  sameRole?: boolean;
  visibleToRoles?: readonly RoleId[];
  publicOnReveal?: boolean;
};

export type RoleDefinition = {
  notebook?: { description: string };
  id: RoleId;
  name: string;
  description: string;
  frame: string;
  frameVisibility?: RoleFrameVisibility;
  night?: RoleTiming;
  day?: RoleTiming;
  buttons?: {
    night?: readonly RoleButton[];
    day?: readonly RoleButton[];
  };
  selection?: RoleSelection;
  targeting?: RoleTargeting;
  cameraLayout?: RoleCameraLayout;
};

export type RoleActionPlayer = {
  id: string;
  userRole: "player" | "storyteller" | "gamemaster";
  gameRole: RoleId | null;
  isAlive: boolean;
};

export type RoleActionPhase = {
  period: RoleActionPeriod;
  stepId: string | null;
  round: number;
};

export type RoleEffect =
  | { type: "eliminate"; targetId: string; reason: string }
  | { type: "protect"; targetId: string }
  | { type: "reveal"; targetId: string };

export type RoleNightInfo = Readonly<{ werewolfTargetId: string | null }>;

export type RoleActionContext = {
  actorId: string;
  actionId: string;
  targetId?: string;
  round: number;
  night?: RoleNightInfo;
};

export type RoleSelectContext = {
  actorId: string;
  targetId: string;
  round: number;
};

export type RoleEventContext = {
  round: number;
  players: readonly RoleActionPlayer[];
  confirmedActorIds: ReadonlySet<string>;
  night?: RoleNightInfo;
};

export type RoleActionResult =
  | { ok: true; effects?: readonly RoleEffect[] }
  | { ok: false; reason: string };

export type RoleActions = {
  select?: (context: RoleSelectContext) => RoleActionResult;
  getSelection?: (actorId: string) => string | null;
  reset?: () => void;
  onNightStart?: (context: RoleEventContext) => readonly RoleEffect[];
  onNightAction?: (context: RoleActionContext) => RoleActionResult;
  onNightStepEnd?: (context: RoleEventContext) => readonly RoleEffect[];
  onDayAction?: (context: RoleActionContext) => RoleActionResult;
  onDayEnd?: (context: RoleEventContext) => readonly RoleEffect[];
  onNightEnd?: (context: RoleEventContext) => readonly RoleEffect[];
  onDayStart?: (context: RoleEventContext) => readonly RoleEffect[];
  getDayVoteWeight?: (actorId: string) => number;
  onGameReset?: () => void;
  onDeath?: (playerId: string) => void;
};

export type RoleModule = { config: RoleDefinition; actions: RoleActions };
export type NotebookRoleInfo = { id: RoleId; name: string; description: string };
export type PublicRoleInfo = Pick<RoleDefinition, "id" | "name" | "description" | "frame">;
