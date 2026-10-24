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

  // Später: Alle lebenden Werwölfe gemeinsam anordnen
  cameraLayout: {
    night: {
      active: {
        enabled: true,
        target: "same-role",
        layout: "dynamic",
        area: {
          x: 15,
          y: 25,
          width: 70,
          height: 50,
        },
      },
    },
  },
} satisfies RoleDefinition;