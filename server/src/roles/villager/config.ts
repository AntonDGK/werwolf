import type { RoleDefinition } from "../RoleTypes";

// Standardrolle ohne Spezialfähigkeit
export const villagerConfig = {
  id: "villager",
  name: "Dorfbewohner",
  description: "Versucht tagsüber, die Werwölfe zu entlarven.",
  notebook: {
    description: `Die **Dorfbewohner** versuchen gemeinsam, die **Werwölfe** zu finden.

Tagsüber können sie bei der Abstimmung mitentscheiden.`,
  },
  frame: "",
} satisfies RoleDefinition;
