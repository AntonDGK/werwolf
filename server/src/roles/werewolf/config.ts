import type { RoleDefinition } from "../RoleTypes";

export const werewolfConfig = {
  id: "werewolf",
  name: "Werwolf",
  description: "Wählt nachts gemeinsam ein Opfer.",
  frame: "werewolf",

  // Nachtphase
  night: {
    enabled: true,
    separatePhase: true,
    order: 20,
    frequency: "every-night",
    phaseGroup: "werewolves",
  },

  // Tagesphase
  day: {
    enabled: false,
    separatePhase: false,
  },

  buttons: {
    night: [
      { id: "confirm", label: "Opfer bestätigen", kind: "confirm", confirmedLabel: "Bestätigt" },
    ],
    day: [],
  },

  // Auswahl muss bestätigt werden
  selection: {
    requiresConfirmation: true,
  },

  // Regeln für die Opferauswahl
  targeting: {
    allowSelfTarget: false,
    allowSameRoleTarget: false,
    onlyAliveTargets: true,
  },

  // Später: Alle lebenden Werwölfe zentral anordnen
  cameraLayout: {
    night: {
      active: {
        target: "same-role",
        mode: "center",
      },
    },
  },
} satisfies RoleDefinition;