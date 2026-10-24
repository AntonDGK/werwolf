import { useEffect, useState } from "react";
import { socket } from "../socket";
import type { PublicPlayer } from "../types/Player";
import "./StorytellerManager.css";

type StorytellerManagerProps = {
  players: PublicPlayer[];
};

export default function StorytellerManager({
  players,
}: StorytellerManagerProps) {
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [connected, setConnected] = useState(socket.connected);

  const storyteller = players.find(
    (player) => player.userRole === "storyteller"
  );
  const candidates = players.filter(
    (player) =>
      player.userRole === "player" || player.userRole === "storyteller"
  );

  useEffect(() => {
    const handleUpdated = () => {
      setPending(false);
      setStatus("Erzählerberechtigung aktualisiert.");
    };

    const handleError = (message: unknown) => {
      setPending(false);
      setStatus(
        typeof message === "string"
          ? message
          : "Die Änderung konnte nicht ausgeführt werden."
      );
    };

    const handleConnect = () => {
      setConnected(true);
      setPending(false);
    };

    const handleDisconnect = () => {
      setConnected(false);
      setPending(false);
      setStatus("Verbindung zum Server getrennt.");
    };

    socket.on("storyteller:updated", handleUpdated);
    socket.on("storyteller:error", handleError);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off("storyteller:updated", handleUpdated);
      socket.off("storyteller:error", handleError);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, []);

  const appoint = (player: PublicPlayer) => {
    if (!connected || pending || player.userRole === "storyteller") return;
    if (!window.confirm(`${player.name} zum Erzähler ernennen?`)) return;

    setStatus("");
    setPending(true);
    socket.emit("storyteller:set", player.id);
  };

  const remove = () => {
    if (!connected || pending || !storyteller) return;
    if (!window.confirm(`${storyteller.name} als Erzähler absetzen?`)) return;

    setStatus("");
    setPending(true);
    socket.emit("storyteller:set", null);
  };

  return (
    <section className="storyteller-manager">
      <h2>📖 Erzähler verwalten</h2>
      <p>
        Nur der Gamemaster kann einen angemeldeten Spieler zum Erzähler
        ernennen. Die Kontoverwaltung bleibt beim Gamemaster.
      </p>

      <p>
        Aktueller Erzähler: <strong>{storyteller?.name ?? "Niemand"}</strong>
      </p>

      <h3>Angemeldete Spieler</h3>
      {candidates.length === 0 ? (
        <p>Aktuell ist kein Spieler angemeldet.</p>
      ) : (
        <div className="storyteller-list">
          {candidates.map((player) => (
            <div className="storyteller-result" key={player.id}>
              <h4>{player.name}</h4>
              <p>
                {player.userRole === "storyteller"
                  ? "📖 Aktueller Erzähler"
                  : "Normaler Spieler"}
              </p>
              <div className="storyteller-actions">
                <button
                  type="button"
                  disabled={
                    !connected || pending || player.userRole === "storyteller"
                  }
                  onClick={() => appoint(player)}
                >
                  {player.userRole === "storyteller"
                    ? "Bereits Erzähler"
                    : "Zum Erzähler ernennen"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {storyteller && (
        <div className="storyteller-actions storyteller-remove-actions">
          <button
            type="button"
            disabled={!connected || pending}
            onClick={remove}
          >
            Erzählerberechtigung entfernen
          </button>
        </div>
      )}

      {status && <p role="status">{status}</p>}
    </section>
  );
}
