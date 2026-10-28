import type { RoleDefinition } from "../RoleTypes";

export const werewolfConfig = {
  id: "werewolf",
  name: "Werwolf",
  description: "Wählt nachts gemeinsam ein Opfer.",
  notebook: {
    description: `Die **Werwölfe** wählen nachts gemeinsam ein Opfer und bestätigen ihre Stimmen.

++Ihr Ziel:++ Die Dorfbewohner besiegen.`,
  },
  frame: "frame-werewolf.png",
  frameVisibility: {
    sameRole: true,
  },

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