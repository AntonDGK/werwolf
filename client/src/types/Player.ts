
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
export type PublicPlayer = Omit<Player, "gameRole">;