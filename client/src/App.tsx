import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

import CameraPreview from "./components/CameraPreview";
import { socket } from "./socket";

// TODO: Die Spieltypen später in einem gemeinsamen Paket verwalten.
type UserRole = "gamemaster" | "storyteller" | "player";
type GamePhase = "lobby" | "preparation" | "night" | "day" | "finished";
type Screen = "start" | GamePhase;

type PublicPlayer = {
  id: string;
  name: string;
  userRole: UserRole;
  color: string | null;
};

function isGamePhase(value: unknown): value is GamePhase {
  return (
    value === "lobby" ||
    value === "preparation" ||
    value === "night" ||
    value === "day" ||
    value === "finished"
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("start");
  const [name, setName] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("player");
  const [connected, setConnected] = useState(socket.connected);
  const [players, setPlayers] = useState<PublicPlayer[]>([]);

  useEffect(() => {
    const handleConnect = () => {
      setConnected(true);
      console.log("Socket verbunden:", socket.id);
    };

    const handleDisconnect = () => {
      setConnected(false);
      setScreen("start");
      setPlayers([]);
    };

    const handleJoined = () => {
      setUserRole("player");
      setScreen("lobby");
    };

    const handleJoinedAdmin = () => {
      setUserRole("gamemaster");
      setScreen("lobby");
    };

    const handlePhaseChanged = (phase: unknown) => {
      if (isGamePhase(phase)) setScreen(phase);
    };

    const handlePlayers = (list: PublicPlayer[]) => {
      if (Array.isArray(list)) setPlayers(list);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("joined", handleJoined);
    socket.on("joinedAdmin", handleJoinedAdmin);
    socket.on("phaseChanged", handlePhaseChanged);
    socket.on("players", handlePlayers);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("joined", handleJoined);
      socket.off("joinedAdmin", handleJoinedAdmin);
      socket.off("phaseChanged", handlePhaseChanged);
      socket.off("players", handlePlayers);
    };
  }, []);

  const handleJoin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!connected || !cleanName) return;

    // TODO: Passwort, Einladungscode und GM-Freigabe ergänzen.
    // Benutzerrollen werden ausschließlich vom Server zugewiesen.
    socket.emit("join", cleanName);
  };

  return (
    <main className="werwolf-app">
      <h1>🐺 Werwolf Engine</h1>

      {screen === "start" ? (
        <section className="werwolf-panel">
          <h2>Beitreten</h2>
          <form className="join-form" onSubmit={handleJoin}>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Dein Name"
              aria-label="Dein Name"
              maxLength={30}
              required
            />
            <button type="submit" disabled={!connected || !name.trim()}>
              Beitreten
            </button>
          </form>
          {!connected && <p>Verbindung zum Server wird hergestellt …</p>}
          {/* TODO: Echtes Login und Zugangskontrolle einbauen. */}
        </section>
      ) : (
        <section className="werwolf-panel">
          <h2>{screen === "lobby" ? "Lobby" : `Spielphase: ${screen}`}</h2>
          <p>Willkommen, {name}!</p>
          <p>Deine Berechtigung: {userRole}</p>

          <h3>Spieler ({players.length})</h3>
          <ul>
            {players.map((player) => (
              <li key={player.id}>
                {player.name} – {player.userRole}
              </li>
            ))}
          </ul>

          {/* TODO: Gamemaster-, Erzähler- und Spieleroberflächen. */}
          {/* TODO: Werwolf-Rollen und Phasensteuerung. */}
        </section>
      )}

      {/* Bleibt in allen Phasen eingebunden, damit WebRTC weiterläuft. */}
      <CameraPreview />
    </main>
  );
}
