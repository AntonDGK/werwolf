import type { GamePhase, UserRole } from "../types/Types";
import type { PublicPlayer } from "../types/Player";
import { useEffect, useState } from "react";
import { socket } from "../socket";
import "./GameScene.css";
import "./GameResult.css";
import CameraLayer from "./CameraLayer";
import RoleNotebook from "./RoleNotebook";
import type { VoteStatus } from "./DayVotePanel";

type RoleActionState = {
  active: boolean;
  requiresConfirmation: boolean;
  confirmed: boolean;
  hasSelection: boolean;
  selectedTargetId: string | null;
  targetIds: string[];
  buttons: { id: string; label: string; disabled: boolean }[];
};

type GameSceneProps = {
  phase: GamePhase;
  name: string;
  userRole: UserRole;
  players: PublicPlayer[];
  privateRole?: { roleId: string | null; name: string | null };
  teammates?: { id: string; name: string }[];
  onOpenCamera?: () => void;
  onOpenPhaseRemote?: () => void;
};


export default function GameScene({
  phase,
  userRole,
  players,
  privateRole,
  teammates = [],
  onOpenCamera,
  onOpenPhaseRemote,
}: GameSceneProps) {
  const [vote, setVote] = useState<VoteStatus | null>(null);
  const [gameResult, setGameResult] = useState<{
    winner: "werewolves" | "village";
    checkpoint: "day-vote" | "night-end";
    autoRestartOnWin: boolean;
  } | null>(null);
  const [elimination, setElimination] = useState<{playerId: string; sequence: number} | null>(null);
  const [maskNightCameras, setMaskNightCameras] = useState(false);
  const [visibleFrames, setVisibleFrames] = useState<Record<string, string>>({});
  const [roleAction, setRoleAction] = useState<RoleActionState | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleAnnouncement, setRoleAnnouncement] = useState<string | null>(null);

  useEffect(() => {
    const onState = (value: RoleActionState) => {
      setRoleAction(value);
      setRoleError(null);
    };
    const onError = (message: string) => setRoleError(message);
    const onRevealed = (event: { name: string; roleName: string }) =>
      setRoleAnnouncement(`${event.name} ist ${event.roleName}.`);
    const onRoleEliminated = (event: { name: string }) =>
      setRoleAnnouncement(`${event.name} wurde eliminiert.`);
    const request = () => socket.emit("role:state:request");
    socket.on("role:state", onState);
    socket.on("role:error", onError);
    socket.on("role:revealed", onRevealed);
    socket.on("role:eliminated", onRoleEliminated);
    socket.on("connect", request);
    request();
    return () => {
      socket.off("role:state", onState);
      socket.off("role:error", onError);
      socket.off("role:revealed", onRevealed);
      socket.off("role:eliminated", onRoleEliminated);
      socket.off("connect", request);
    };
  }, []);

  useEffect(() => {
    setRoleAction(null);
    setRoleError(null);
    socket.emit("role:state:request");
  }, [phase, userRole, privateRole?.roleId]);

  useEffect(() => {
    if (phase === "night" || phase === "lobby" || phase === "preparation") {
      setRoleAnnouncement(null);
    }
  }, [phase]);

  useEffect(() => {
    const onResult = (value: typeof gameResult) => setGameResult(value);
    const requestResult = () => socket.emit("game:result:request");
    socket.on("game:result", onResult);
    socket.on("connect", requestResult);
    requestResult();
    return () => {
      socket.off("game:result", onResult);
      socket.off("connect", requestResult);
    };
  }, []);

  useEffect(() => {
    const onStatus = (next: VoteStatus) => setVote(next);
    const onEliminated = (event: { playerId?: string }) => {
      if (typeof event?.playerId !== "string") return;
      setElimination(previous => ({
        playerId: event.playerId!,
        sequence: (previous?.sequence ?? 0) + 1,
      }));
    };
    socket.on("day-vote:status", onStatus);
    socket.on("day-vote:eliminated", onEliminated);
    socket.emit("day-vote:request");
    return () => {
      socket.off("day-vote:status", onStatus);
      socket.off("day-vote:eliminated", onEliminated);
    };
  }, []);

  useEffect(() => {
    const onViewSettings = (data: { maskNightCameras?: boolean }) => {
      setMaskNightCameras(data?.maskNightCameras === true);
    };
    const onFrames = (data: unknown) => {
      if (!data || typeof data !== "object" || Array.isArray(data)) return;
      const values = Object.entries(data).filter(([id, file]) =>
        id.length > 0 && typeof file === "string" && /^[a-zA-Z0-9_-]+\.png$/.test(file));
      setVisibleFrames(Object.fromEntries(values));
    };
    const onConnect = () => {
      socket.emit("scene:viewer-settings:request");
      socket.emit("game-role:frames:request");
    };
    socket.on("scene:viewer-settings", onViewSettings);
    socket.on("game-role:frames", onFrames);
    socket.on("connect", onConnect);
    onConnect();
    return () => {
      socket.off("scene:viewer-settings", onViewSettings);
      socket.off("game-role:frames", onFrames);
      socket.off("connect", onConnect);
    };
  }, []);

  return (
    <section className="game-scene" data-phase={phase}>
      <header className="game-scene__header">
        <h1>🐺 Werwolf Engine</h1>
        {userRole === "player" && roleAction?.active && roleAction.buttons?.length > 0 && (
          <div className="game-scene__role-buttons">
            {roleAction.buttons.map(button => (
              <button key={button.id} type="button" disabled={button.disabled}
                onClick={() => socket.emit("role:action", button.id)}>
                {button.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {roleError && <p className="game-scene__role-message" role="alert">{roleError}</p>}
      {roleAnnouncement && <p className="game-scene__role-message" role="status">{roleAnnouncement}</p>}
      <div className="game-scene__content">

        {phase === "finished" && gameResult && (
          <div className="game-scene__game-result" role="status">
            <strong>{gameResult.winner === "werewolves" ? "🐺 Die Werwölfe gewinnen!" : "🏡 Das Dorf gewinnt!"}</strong>
            <small>{gameResult.autoRestartOnWin
              ? "Neue Runde startet gleich in der Lobby."
              : "Der Gamemaster kann die Runde in der Lobby zurücksetzen."}</small>
          </div>
        )}
        <CameraLayer players={players} viewerRole={userRole} phase={phase}
          visibleFrames={visibleFrames}
          vote={vote} elimination={elimination}
          roleAction={phase === "night" && userRole === "player" ? roleAction : null}
          maskNightCameras={maskNightCameras} />
      </div>

      <footer className="game-scene__footer">
        {userRole !== "gamemaster" && onOpenCamera && (
          <button type="button" onClick={onOpenCamera} aria-label="Kameraeinstellungen öffnen">
            ⚙️ Kamera
          </button>
        )}
        {userRole === "storyteller" && onOpenPhaseRemote && (
          <button type="button" onClick={onOpenPhaseRemote} aria-label="Phasenfenster oeffnen">
            🎛 Phasenfenster
          </button>
        )}
        <RoleNotebook phase={phase} ownRoleId={privateRole?.roleId ?? null} isPlayer={userRole === "player"} />
      </footer>
    </section>
  );
}
