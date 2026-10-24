import { useEffect, useState } from "react";
import "./App.css";

import CameraPreview from "./components/CameraPreview";
import LoginScreen from "./components/LoginScreen";
import type { LoginMode } from "./components/LoginScreen";
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
  const [loginMode, setLoginMode] = useState<LoginMode>("player");
  const [cameraSettingsOpen, setCameraSettingsOpen] = useState(false);
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
      setCameraSettingsOpen(false);
      setPlayers([]);
      setUserRole("player");
      setLoginError("");
    };

    const handleJoined = () => {
      setUserRole("player");
      setLoginError("");
      setCameraSettingsOpen(false);
      setScreen("lobby");
    };

    const handleJoinedAdmin = () => {
      setName("Gamemaster");
      setUserRole("gamemaster");
      setLoginError("");
      setCameraSettingsOpen(false);
      setScreen("lobby");
    };

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

    const handleKicked = (message: unknown) => {
      setLoginError(
        typeof message === "string" ? message : "Deine Sitzung wurde beendet."
      );
      setScreen("start");
      setCameraSettingsOpen(false);
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
    socket.on("auth:kicked", handleKicked);
    socket.on("phaseChanged", handlePhaseChanged);
    socket.on("players", handlePlayers);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("joined", handleJoined);
      socket.off("joinedAdmin", handleJoinedAdmin);
      socket.off("role:changed", handleRoleChanged);
      socket.off("auth:error", handleAuthError);
      socket.off("auth:kicked", handleKicked);
      socket.off("phaseChanged", handlePhaseChanged);
      socket.off("players", handlePlayers);
    };
  }, []);

  // Kamera niemals automatisch starten. "enabled" schützt insbesondere den Gamemaster.
  const cameraAllowed = screen === "start"
    ? loginMode === "player"
    : userRole !== "gamemaster";
  const cameraVisible = screen === "start"
    ? loginMode === "player"
    : userRole !== "gamemaster" && cameraSettingsOpen;

  return (
    <main className={`werwolf-app${screen === "start" ? " werwolf-app--login" : ""}`}>
      {screen === "start" && <h1>🐺 Werwolf Engine</h1>}

      {screen === "start" ? (
        <LoginScreen
          connected={connected}
          loginError={loginError}
          onModeChange={setLoginMode}
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
            onOpenCamera={
              userRole !== "gamemaster"
                ? () => setCameraSettingsOpen(true)
                : undefined
            }
          />
          {userRole === "gamemaster" && <AdminPanel players={players} />}
        </>
      )}

      {/* Bleibt IMMER gemountet: laufende Kamera/Peer-Verbindung bleibt beim Login erhalten. */}
      <div
        className={screen === "start" ? "camera-settings camera-settings--login" : "camera-settings camera-settings--dialog"}
        style={{ display: cameraVisible ? undefined : "none" }}
      >
        {screen !== "start" && (
          <button
            className="camera-settings__close"
            type="button"
            onClick={() => setCameraSettingsOpen(false)}
            aria-label="Kameraeinstellungen schließen"
          >
            ✕ Schließen
          </button>
        )}
        <CameraPreview enabled={cameraAllowed} authenticated={screen !== "start"} />
      </div>
    </main>
  );
}
