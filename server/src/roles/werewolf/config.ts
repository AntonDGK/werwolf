import type { RoleDefinition } from "../RoleTypes";

export const werewolfConfig = {
  id: "werewolf",
  name: "Werwolf",
  description: "Wählt nachts gemeinsam ein Opfer.",
  frame: "werewolf",
  night: {
    enabled: true,
    separatePhase: true,
    order: 20,
    frequency: "every-night",
    phaseGroup: "werewolves",
  },
  day: {
    enabled: false,
    separatePhase: false,
  },
  targeting: {
    allowSelfTarget: false,
    allowSameRoleTarget: false,
    onlyAliveTargets: true,
  },
  // Später: Alle lebenden Werwölfe gemeinsam anordnen
  cameraLayout: {
    night: {
      active: {
        target: "same-role",
        mode: "center",
      },
    },
  },
} satisfies RoleDefinition;