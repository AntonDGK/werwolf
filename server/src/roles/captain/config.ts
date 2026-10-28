import type { RoleDefinition } from "../RoleTypes";

export const captainConfig = {
  id: "captain",
  name: "Hauptmann",
  description: "Kann sich tagsüber offenbaren. Danach zählt seine Tagesstimme doppelt.",
  frame: "captain",
  night: { enabled: false, separatePhase: false },
  day: { enabled: true, separatePhase: false },
  buttons: {
    day: [{
      id: "reveal",
      label: "Als Hauptmann offenbaren",
      once: true,
      usedLabel: "Als Hauptmann offenbart",
    }],
    night: [],
  },
} satisfies RoleDefinition;
