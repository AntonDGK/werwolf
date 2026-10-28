import type { RoleDefinition } from "../RoleTypes";

export const seerConfig = {
  id: "seer",
  name: "Seher",
  description: "Kann nachts die Rolle eines Spielers untersuchen.",
  frame: "seer",
  night: {
    enabled: true,
    separatePhase: true,
    order: 30,
    frequency: "every-night",
    phaseGroup: "seer",
  },
  day: {
    enabled: false,
    separatePhase: false,
  },

  buttons: { night: [], day: [] },

  // Später: Seher während seiner Nachtphase hervorheben
  cameraLayout: {
    night: {
      active: {
        enabled: true,
        target: "same-role",
        layout: "dynamic",
        area: {
          x: 30,
          y: 25,
          width: 40,
          height: 50,
        },
      },
    },
  },
} satisfies RoleDefinition;