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
  day: { enabled: false, separatePhase: false },
} satisfies RoleDefinition;
