import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

import CameraPreview from "./components/CameraPreview";
import LoginScreen from "./components/LoginScreen";
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
  const [loginMode, setLoginMode] = useState<"player" | "gamemaster">("player");
  const [adminPassword, setAdminPassword] = useState("");
  const [loginError, setLoginError] = useState("");
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
      setLoginError("");
      setScreen("lobby");
    };

    const handleJoinedAdmin = () => {
      setName("Gamemaster");
      setUserRole("gamemaster");
      setLoginError("");
      setScreen("lobby");
    };

    const handleAuthError = (message: string) => {
      setLoginError(message);
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
    socket.on("auth:error", handleAuthError);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("joined", handleJoined);
      socket.off("joinedAdmin", handleJoinedAdmin);
      socket.off("phaseChanged", handlePhaseChanged);
      socket.off("players", handlePlayers);
      socket.off("auth:error", handleAuthError);
    };
  }, []);

  const handleJoin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!connected) return;

    setLoginError("");

    if (loginMode === "gamemaster") {
      if (!adminPassword) return;

      // Passwort wird ausschließlich vom Server überprüft.
      socket.emit("admin:login", adminPassword);
      return;
    }

    const cleanName = name.trim();
    if (!cleanName) return;

    // TODO: Individuelle Spielerpasswörter und GM-Freigabe.
    socket.emit("join", cleanName);
  };

  return (
    <main className="werwolf-app">
      <h1>🐺 Werwolf Engine</h1>

      {/* LOGIN */}
      {screen === "start" ? (
        <LoginScreen
          connected={connected}
          loginError={loginError}
          onPlayerJoin={(playerName) => {
            setLoginError("");
            setName(playerName);
            socket.emit("join", playerName);
          }}
          onAdminLogin={(password) => {
            setLoginError("");
            socket.emit("admin:login", password);
          }}
        />
      ) : (
        /* LOBBY UND SPIEL */
        <section className="werwolf-panel">
          <h2>
            {screen === "lobby"
              ? "Lobby"
              : `Spielphase: ${screen}`}
          </h2>

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

          {/* TODO: Gamemaster-Dashboard */}
          {/* TODO: Erzähler-Dashboard */}
          {/* TODO: Spieler-Dashboard */}
          {/* TODO: Werwolf-Spielphasen */}
        </section>
      )}

      {/* Kamera bleibt immer eingebunden. */}
      <CameraPreview />
    </main>
  );
}
