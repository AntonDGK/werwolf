
/**
 * WERWOLF ENGINE
 * Gemeinsame Typen für den Spielablauf
 */

// Die fünf Hauptphasen des Spiels.
export type GamePhase =
  | "lobby"
  | "preparation"
  | "night"
  | "day"
  | "finished";

// Abschnitte während des Tages.
export type DayStep =
  | "announcement" // Ergebnisse der Nacht verkünden
  | "discussion"   // Spieler diskutieren
  | "voting"       // Spieler stimmen ab
  | "resolution";  // Abstimmung auswerten

// Werwolf-Rollen im Spiel.
// Diese Liste können wir später erweitern.
export type WerewolfRole =
  | "villager"
  | "werewolf"
  | "seer"
  | "witch"
  | "healer"
  | "hunter"
  | "cupid";

// Welche Rolle ist gerade in der Nacht am Zug?
// null = kein Nachtzug aktiv
export type NightStep =
  | "werewolves"
  | "seer"
  | "witch"
  | "healer"
  | "cupid"
  | null;

// Aktionen, die Spieler nachts auswählen können.
// Die tatsächliche Erlaubnis prüft später der Server.
export type NightAction =
  | {
      type: "werewolf_kill";
      targetId: string;
    }
  | {
      type: "seer_inspect";
      targetId: string;
    }
  | {
      type: "healer_protect";
      targetId: string;
    }
  | {
      type: "witch_heal";
      targetId: string;
    }
  | {
      type: "witch_poison";
      targetId: string;
    }
  | {
      type: "cupid_link";
      targetIds: [string, string];
    };

// Der aktuelle Zustand einer Werwolf-Runde.
export type GameState = {
  phase: GamePhase;

  // Aktuelle Nacht / aktueller Tag
  round: number;

  // Nur während der Nacht relevant
  nightStep: NightStep;

  // Nur während des Tages relevant
  dayStep: DayStep | null;

  // Ob die Runde momentan läuft
  gameStarted: boolean;
};

// Standardzustand für eine neue Runde.
export const initialGameState: GameState = {
  phase: "lobby",
  round: 0,
  nightStep: null,
  dayStep: null,
  gameStarted: false,
};
