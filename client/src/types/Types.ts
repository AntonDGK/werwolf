
/**
 * WERWOLF ENGINE – SPIELTYPEN
 */

// Berechtigung eines Benutzers auf der Webseite
export type UserRole =
  | "gamemaster"
  | "storyteller"
  | "player";

// Die eigentlichen Werwolf-Spielrollen
export type WerewolfRole =
  | "villager"
  | "werewolf"
  | "seer"
  | "witch"
  | "healer"
  | "hunter"
  | "cupid";

// Hauptphasen der Werwolf-Runde
export type GamePhase =
  | "lobby"
  | "preparation"
  | "night"
  | "day"
  | "finished";

// Schritte während des Tages
export type DayStep =
  | "announcement"
  | "discussion"
  | "voting"
  | "resolution";

// Schritte während der Nacht
export type NightStep =
  | "werewolves"
  | "seer"
  | "witch"
  | "healer"
  | "cupid"
  | null;

// Mögliche Nachtaktionen
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

// Aktueller Spielzustand
export type GameState = {
  phase: GamePhase;
  round: number;
  nightStep: NightStep;
  dayStep: DayStep | null;
  gameStarted: boolean;
};

// Startzustand einer neuen Runde
export const initialGameState: GameState = {
  phase: "lobby",
  round: 0,
  nightStep: null,
  dayStep: null,
  gameStarted: false,
};
