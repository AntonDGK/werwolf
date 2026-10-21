
/**
 * WERWOLF ENGINE – GEMEINSAME TYPEN
 */

// Berechtigungen auf der Webseite
export type UserRole =
  | "gamemaster"
  | "storyteller"
  | "player";

// Geheime Rollen innerhalb einer Spielrunde
export type WerewolfRole =
  | "villager"
  | "werewolf"
  | "seer"
  | "witch"
  | "healer"
  | "hunter"
  | "cupid";

// Hauptphasen
export type GamePhase =
  | "lobby"
  | "preparation"
  | "night"
  | "day"
  | "finished";

// Tagesabschnitte
export type DayStep =
  | "announcement"
  | "discussion"
  | "voting"
  | "resolution";

// Nachtabschnitte
export type NightStep =
  | "werewolves"
  | "seer"
  | "witch"
  | "healer"
  | "cupid"
  | null;

// Aktionen während der Nacht
export type NightAction =
  | { type: "werewolf_kill"; targetId: string }
  | { type: "seer_inspect"; targetId: string }
  | { type: "healer_protect"; targetId: string }
  | { type: "witch_heal"; targetId: string }
  | { type: "witch_poison"; targetId: string }
  | { type: "cupid_link"; targetIds: [string, string] };

// Spielzustand
export type GameState = {
  phase: GamePhase;
  round: number;
  nightStep: NightStep;
  dayStep: DayStep | null;
  gameStarted: boolean;
};

export const initialGameState: GameState = {
  phase: "lobby",
  round: 0,
  nightStep: null,
  dayStep: null,
  gameStarted: false,
};
