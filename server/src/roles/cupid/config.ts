import type { RoleDefinition } from "../RoleTypes";

export const cupidConfig = {
  id: "cupid",
  name: "Amor",
  description: "Verbindet in der ersten Nacht zwei Spieler als Verliebte.",
  notebook: {
    description: `**Amor** wählt in der ersten Nacht zwei Spieler, die sich verlieben.

Sterben die Verliebten, stirbt ihr Partner ebenfalls.

++Ein gemischtes Liebespaar kann gemeinsam gewinnen.++`,
  },
  frame: "frame-default.png",
  night: { enabled: true, separatePhase: true, order: 10, frequency: "first-night" },
  day: { enabled: false, separatePhase: false },
  selection: { requiresConfirmation: true, targetCount: 2 },
  targeting: { allowSelfTarget: true, allowSameRoleTarget: true, onlyAliveTargets: true },
  buttons: {
    night: [{ id: "confirm", label: "Verliebte bestätigen", kind: "confirm", confirmedLabel: "Bestätigt" }],
    day: [],
  },
} satisfies RoleDefinition;
