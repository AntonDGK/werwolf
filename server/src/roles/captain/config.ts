import type { RoleDefinition } from "../RoleTypes";

export const captainConfig = {
  id: "captain",
  name: "Hauptmann",
  description: "Kann sich tagsüber offenbaren. Danach zählt seine Tagesstimme doppelt.",
  notebook: {
    description: `Der **Hauptmann** kann sich tagsüber **offenbaren**.

Nach seiner Offenbarung zählt seine Stimme bei Tagesabstimmungen **doppelt**.

++Die Offenbarung ist nur einmal pro Spiel möglich.++`,
  },
  frame: "frame-captain.png",
  frameVisibility: {
    publicOnReveal: true,
  },
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
