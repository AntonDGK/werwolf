import type {
  UserRole,
  GameRoleId,
} from "./Types";

export type Player = {
  // Aktuelle Socket.IO-Verbindung
  id: string;

  // Anzeigename
  name: string;

  // Berechtigung auf der Webseite
  userRole: UserRole;

  // Geheime Rolle innerhalb der Werwolf-Runde
  // null = noch keine Rolle zugewiesen
  gameRole: GameRoleId | null;

  // Lebt der Spieler noch?
  isAlive: boolean;

  // Optionale Anzeigefarbe
  color: string | null;

  // TODO: Kamerastatus später separat verwalten.
  // Browserinterne Kamera-IDs nicht an den Server senden.
};

// Öffentliche Spielerliste vom Server (niemals geheime Spielrollen).
// Für App und Admin-Komponenten gemeinsam verwendbar.
export type PublicPlayer = Pick<Player, "id" | "name" | "userRole" | "color" | "isAlive">;
