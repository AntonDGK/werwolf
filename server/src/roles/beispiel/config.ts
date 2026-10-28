import type { RoleDefinition } from "../RoleTypes";

// Vorlage: Beim Kopieren ID, Name und Frame anpassen.
export const beispielConfig = {
  id: "beispiel",             // Eindeutige Rollen-ID
  name: "Beispielrolle",      // Anzeigename
  description: "Rollenvorlage ohne aktive Fähigkeit.", // Rollenbeschreibung
  frame: "beispiel",          // Rahmen-ID

  night: {
    enabled: true,            // Nachts aktiv
    separatePhase: true,      // Eigener Nachtabschnitt
    order: 50,                // Reihenfolge: klein zuerst
    frequency: "every-night", // every-night | first-night | once
    phaseGroup: "beispiel",    // Gemeinsame Nachtgruppe
    canSeeWerewolfTarget: false, // Werwolf-Opfer sichtbar?
  },

  day: {
    enabled: true,            // Tagsüber aktiv
    separatePhase: false,     // Kein eigener Tagesabschnitt
    frequency: "every-day",   // every-day | once
  },

  buttons: {
    night: [
      {
        id: "nacht-aktion",    // An onNightAction.actionId
        label: "Nachtaktion",   // Button-Text
        requiresSelection: true, // Ziel vorher wählen
        // once: true,         // Einmal pro Spiel
        // usedLabel: "Benutzt", // Text nach Verwendung
      },
      // { id: "bestaetigen", label: "Bestätigen", kind: "confirm", confirmedLabel: "Bestätigt" },
    ],
    day: [
      {
        id: "tag-aktion",     // An onDayAction.actionId
        label: "Tagesaktion",   // Button-Text
        once: true,            // Einmal pro Spiel
        usedLabel: "Verwendet", // Text nach Verwendung
        // requiresSelection: true, // Ziel vorher wählen
      },
    ],
  },

  selection: {
    requiresConfirmation: false, // Ziel bestätigen lassen?
  },

  targeting: {
    allowSelfTarget: true,      // Sich selbst wählen?
    allowSameRoleTarget: true,  // Gleiche Rolle wählen?
    onlyAliveTargets: true,     // Nur lebende Ziele?
  },

  // Optional: Kamera-Layout nur konfigurieren.
  // cameraLayout: { night: { active: { target: "self", mode: "center" } } },
} satisfies RoleDefinition;
