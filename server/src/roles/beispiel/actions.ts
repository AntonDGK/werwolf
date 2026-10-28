import type { RoleActions, RoleActionResult, RoleEffect } from "../RoleTypes";

// Lokale Rollendaten: nachts per reset(), im Spiel per onGameReset().
const selections = new Map<string, string>();

// Effekt-Beispiele:
// { type: "eliminate", targetId: "spieler-id", reason: "beispiel" }
// { type: "protect", targetId: "spieler-id" }
// { type: "reveal", targetId: "spieler-id" }

export const actions: RoleActions = {
  // Zielwahl: actorId, targetId, round
  select: ({ actorId, targetId }) => {
    selections.set(actorId, targetId);
    return { ok: true };
  },

  // Gewähltes Ziel des Spielers
  getSelection: (actorId) => selections.get(actorId) ?? null,

  // Neue Nacht: flüchtige Auswahl löschen
  reset: () => selections.clear(),

  // Nachtbeginn: round, players, confirmedActorIds, night
  onNightStart: (context): RoleEffect[] => {
    // context.players: id, userRole, gameRole, isAlive
    // context.night?.werewolfTargetId: nur mit Freigabe
    return [];
  },

  // Nacht-Button: actorId, actionId, targetId?, round, night?
  onNightAction: ({ actionId, targetId, night }): RoleActionResult => {
    if (actionId !== "nacht-aktion") return { ok: false, reason: "Unbekannte Aktion." };
    // targetId: gewähltes Ziel
    // night?.werewolfTargetId: Werwolf-Opfer, falls freigegeben
    return { ok: false, reason: "Noch nicht implementiert." };
    // Erfolg: { ok: true, effects: [...] }
  },

  // Ende eigener Nachtphase: Effekte für NightState
  onNightStepEnd: ({ players, confirmedActorIds }): RoleEffect[] => {
    // players: Teilnehmer + Rollenstatus
    // confirmedActorIds: Spieler mit bestätigter Auswahl
    return [];
  },

  // Nachtende: Effekte vor finaler Auswertung
  onNightEnd: (context): RoleEffect[] => {
    return [];
  },

  // Tagesbeginn: round, players, confirmedActorIds
  onDayStart: (context): RoleEffect[] => {
    return [];
  },

  // Tag-Button: actorId, actionId, targetId?, round
  onDayAction: ({ actionId, actorId }): RoleActionResult => {
    if (actionId !== "tag-aktion") return { ok: false, reason: "Unbekannte Aktion." };
    // actorId: auslösender Spieler
    return { ok: false, reason: "Noch nicht implementiert." };
    // Erfolg: { ok: true, effects: [...] }
  },

  // Tagesende: Effekte vor der Nacht
  onDayEnd: (context): RoleEffect[] => {
    return [];
  },

  // Tagesstimme: 1 = normal, 2 = doppelt
  getDayVoteWeight: (_actorId) => 1,

  // Spieler stirbt: eigene Daten bereinigen
  onDeath: (playerId) => { selections.delete(playerId); },

  // Spielreset: dauerhafte Rollendaten löschen
  onGameReset: () => selections.clear(),
};
