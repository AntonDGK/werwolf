import { useEffect, useState } from "react";
import "./App.css";

import CameraPreview from "./components/CameraPreview";
import LoginScreen from "./components/LoginScreen";
import AccountManager from "./components/AccountManager";

import { socket } from "./socket";

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
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    const handleConnect = () => {
      setConnected(true);
      console.log("Socket verbunden:", socket.id);
    };

    const handleDisconnect = () => {
      setConnected(false);
      setScreen("start");
      setPlayers([]);
      setLoginError("");
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
    socket.on("auth:error", handleAuthError);
    socket.on("phaseChanged", handlePhaseChanged);
    socket.on("players", handlePlayers);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("joined", handleJoined);
      socket.off("joinedAdmin", handleJoinedAdmin);
      socket.off("auth:error", handleAuthError);
      socket.off("phaseChanged", handlePhaseChanged);
      socket.off("players", handlePlayers);
    };
  }, []);

  return (
    <main className="werwolf-app">
      <h1>🐺 Werwolf Engine</h1>

      {screen === "start" ? (
        <LoginScreen
          connected={connected}
          loginError={loginError}
          onPlayerJoin={(playerName, playerPassword) => {
            setLoginError("");
            setName(playerName);

            socket.emit("player:login", {
              name: playerName,
              password: playerPassword,
            });
          }}
          onAdminLogin={(password) => {
            setLoginError("");
            socket.emit("admin:login", password);
          }}
        />
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

          {/* Nur Gamemaster sehen die Kontoverwaltung. */}
          {userRole === "gamemaster" && (<AccountManager /> )}
          {/* TODO: Individuelle Spielerpasswörter und Freigabe */}
          {/* TODO: Erzählersteuerung und Werwolf-Spielphasen */}
        </section>
      )}

      {/* Kamera bleibt in allen Phasen eingebunden. */}
      <CameraPreview />
    </main>
  );
}
