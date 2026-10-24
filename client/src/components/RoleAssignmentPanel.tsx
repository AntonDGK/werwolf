import { useEffect, useState } from "react";
import { socket } from "../socket";
import type { PublicPlayer } from "../types/Player";
import "./RoleAssignmentPanel.css";

type RoleOption = { id: string; name: string; description: string; frame: string };
type Assignment = { playerId: string; roleId: string | null };

export default function RoleAssignmentPanel({ players }: { players: PublicPlayer[] }) {
  const [catalog, setCatalog] = useState<RoleOption[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    function onCatalog(value: unknown) {
      if (!Array.isArray(value)) return;
      setCatalog(value.filter((v): v is RoleOption =>
        v && typeof v.id === "string" && typeof v.name === "string" &&
        typeof v.description === "string" && typeof v.frame === "string"));
    }
    function onAssignments(value: unknown) {
      if (!Array.isArray(value)) return;
      setAssignments(value.filter((v): v is Assignment =>
        v && typeof v.playerId === "string" &&
        (v.roleId === null || typeof v.roleId === "string")));
    }
    function onUpdated() {
      setPending(null);
      setMessage("Rolle gespeichert.");
    }
    function onError(value: unknown) {
      setPending(null);
      setMessage(typeof value === "string" ? value : "Rolle konnte nicht gespeichert werden.");
    }
    function onDisconnect() {
      setAssignments([]);
      setPending(null);
      setMessage("Verbindung getrennt.");
    }
    socket.on("role:catalog", onCatalog);
    socket.on("game-role:assignments", onAssignments);
    socket.on("game-role:updated", onUpdated);
    socket.on("game-role:error", onError);
    socket.on("disconnect", onDisconnect);
    socket.emit("game-role:request");
    return () => {
      socket.off("role:catalog", onCatalog);
      socket.off("game-role:assignments", onAssignments);
      socket.off("game-role:updated", onUpdated);
      socket.off("game-role:error", onError);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  const candidates = players.filter((player) => player.userRole === "player");

  return (
    <section className="role-assignment">
      <h2>🐺 Spielrollen vergeben</h2>
      <p>Die Auswahl sieht nur der Gamemaster. Jeder Spieler erhält ausschließlich seine eigene Rolle.
        Die Vergabe ist in der Lobby und Vorbereitung möglich.</p>
      {candidates.length === 0 ? (
        <p>Keine normalen Spieler angemeldet.</p>
      ) : (
        <div className="role-assignment__list">
          {candidates.map((player) => (
            <label className="role-assignment__entry" key={player.id}>
              <span>{player.name}</span>
              <select
                aria-label={`Spielrolle für ${player.name}`}
                value={assignments.find((a) => a.playerId === player.id)?.roleId ?? ""}
                disabled={!socket.connected || pending !== null}
                onChange={(event) => {
                  setPending(player.id);
                  setMessage("");
                  socket.emit("game-role:assign", {
                    playerId: player.id,
                    roleId: event.target.value || null,
                  });
                }}
              >
                <option value="">Nicht zugewiesen</option>
                {catalog.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      <p className="role-assignment__note">Zufallsverteilung und Anzahl pro Rolle ergänzen wir später.</p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
