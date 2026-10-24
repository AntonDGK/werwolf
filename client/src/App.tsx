import { useEffect, useState } from "react";
import "./App.css";

import CameraPreview from "./components/CameraPreview";
import LoginScreen from "./components/LoginScreen";
import GameScene from "./components/GameScene";
import AdminPanel from "./components/AdminPanel";
import { socket } from "./socket";
import type { UserRole, GamePhase } from "./types/Types";
import type { PublicPlayer } from "./types/Player";

type Screen = "start" | GamePhase;

function isGamePhase(value: unknown): value is GamePhase {
  return (
    value === "lobby" ||
    value === "preparation" ||
    value === "night" ||
    value === "day" ||
    value === "finished"
  );
}

function isUserRole(value: unknown): value is UserRole {
  return value === "gamemaster" || value === "storyteller" || value === "player";
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
      setUserRole("player");
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

    // Der Server informiert den betroffenen Spieler persönlich darüber,
    // ob er zum Erzähler ernannt oder wieder zum Spieler gemacht wurde.
    const handleRoleChanged = (role: unknown) => {
      if (role === "player" || role === "storyteller") {
        setUserRole(role);
      }
    };

    const handleAuthError = (message: unknown) => {
      setLoginError(
        typeof message === "string" ? message : "Anmeldung fehlgeschlagen."
      );
    };

    const handlePhaseChanged = (phase: unknown) => {
      if (isGamePhase(phase)) setScreen(phase);
    };

    const handlePlayers = (list: unknown) => {
      if (!Array.isArray(list)) return;

      const validPlayers = list.filter(
        (player): player is PublicPlayer =>
          player !== null &&
          typeof player === "object" &&
          typeof player.id === "string" &&
          typeof player.name === "string" &&
          isUserRole(player.userRole) &&
          (typeof player.color === "string" || player.color === null)
      );
      setPlayers(validPlayers);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("joined", handleJoined);
    socket.on("joinedAdmin", handleJoinedAdmin);
    socket.on("role:changed", handleRoleChanged);
    socket.on("auth:error", handleAuthError);
    socket.on("phaseChanged", handlePhaseChanged);
    socket.on("players", handlePlayers);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("joined", handleJoined);
      socket.off("joinedAdmin", handleJoinedAdmin);
      socket.off("role:changed", handleRoleChanged);
      socket.off("auth:error", handleAuthError);
      socket.off("phaseChanged", handlePhaseChanged);
      socket.off("players", handlePlayers);
    };
  }, []);

  return (
    <main className="werwolf-app">
      {screen === "start" && <h1>Werwolf Engine</h1>}

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
        <>
          <GameScene
            phase={screen}
            name={name}
            userRole={userRole}
            players={players}
          />

          {userRole === "gamemaster" && (
            <AdminPanel players={players} />
          )}
        </>
      )}


      {/* Bestehende Kamerafunktion bleibt unverändert eingebunden. */}
      <CameraPreview />
    </main>
  );
}
