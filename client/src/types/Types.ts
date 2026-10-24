/** Web app permissions, NOT secret game roles. */
export type UserRole = "gamemaster" | "storyteller" | "player";

/** Role IDs are validated through RoleManager/RoleRegistry on the server. */
export type GameRoleId = string;

export type GamePhase = "lobby" | "preparation" | "night" | "day" | "finished";
export type DayStep = "announcement" | "discussion" | "voting" | "resolution";

/** No role-specific step union: plugins choose their own phaseGroup. */
export type GameState = {
  phase: GamePhase;
  round: number;
  nightStep: string | null;
  dayStep: DayStep | null;
  gameStarted: boolean;
};

export const initialGameState: GameState = {
  phase: "lobby", round: 0, nightStep: null, dayStep: null, gameStarted: false,
};
