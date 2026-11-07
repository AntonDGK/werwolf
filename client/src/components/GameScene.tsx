import type { GamePhase, UserRole } from "../types/Types";
import type { PublicPlayer } from "../types/Player";
import { useEffect, useState } from "react";
import { socket } from "../socket";
import "./GameScene.css";
import "./GameResult.css";
import CameraLayer from "./CameraLayer";
import AnimationLayer from "../animations/AnimationLayer";
import RoleNotebook from "./RoleNotebook";
import type { VoteStatus } from "./DayVotePanel";

type RoleActionState = {
  active: boolean;
  requiresConfirmation: boolean;
  confirmed: boolean;
  hasSelection: boolean;
  selectedTargetId: string | null;
  selectedTargetIds?: string[];
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
  onOpenCamera,
  onOpenPhaseRemote,
}: GameSceneProps) {
  const [vote, setVote] = useState<VoteStatus | null>(null);
  const [gameResult, setGameResult] = useState<{
    winner: string;
    winnerLabel?: string;
    checkpoint: "day-vote" | "night-end";
    autoRestartOnWin: boolean;
  } | null>(null);
  const [maskNightCameras, setMaskNightCameras] = useState(false);
  const [visibleFrames, setVisibleFrames] = useState<Record<string, string>>({});
  const [focusedPlayerIds, setFocusedPlayerIds] = useState<string[]>([]);
  const [roleAction, setRoleAction] = useState<RoleActionState | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleAnnouncement, setRoleAnnouncement] = useState<string | null>(null);
  const [lovers, setLovers] = useState<{ markedPlayerIds: string[]; partnerName: string | null }>({
    markedPlayerIds: [], partnerName: null,
  });
  const [werewolfVotes, setWerewolfVotes] = useState<{ targetId: string; confirmed: boolean }[]>([]);

  useEffect(() => {
    const onState = (value: RoleActionState) => {
      setRoleAction(value);
      setRoleError(null);
    };
    const onError = (message: string) => setRoleError(message);
    const onRoleEliminated = (event: { name: string }) =>
      setRoleAnnouncement(`${event.name} wurde eliminiert.`);
    const request = () => socket.emit("role:state:request");
    socket.on("role:state", onState);
    socket.on("role:error", onError);
    socket.on("role:eliminated", onRoleEliminated);
    socket.on("connect", request);
    request();
    return () => {
      socket.off("role:state", onState);
      socket.off("role:error", onError);
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
    socket.on("day-vote:status", onStatus);
    socket.emit("day-vote:request");
    return () => {
      socket.off("day-vote:status", onStatus);
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
    const onCameraLayout = (data: unknown) => {
      if (!data || typeof data !== "object" || Array.isArray(data)) return;
      const ids = (data as { focusedPlayerIds?: unknown }).focusedPlayerIds;
      if (Array.isArray(ids) && ids.length <= 64 && ids.every(id => typeof id === "string")) {
        setFocusedPlayerIds(ids);
      }
    };
    const onConnect = () => {
      socket.emit("scene:camera-layout:request");
      socket.emit("scene:viewer-settings:request");
      socket.emit("game-role:frames:request");
    };
    socket.on("scene:camera-layout", onCameraLayout);
    socket.on("scene:viewer-settings", onViewSettings);
    socket.on("game-role:frames", onFrames);
    socket.on("connect", onConnect);
    onConnect();
    return () => {
      socket.off("scene:camera-layout", onCameraLayout);
      socket.off("scene:viewer-settings", onViewSettings);
      socket.off("game-role:frames", onFrames);
      socket.off("connect", onConnect);
    };
  }, []);

  useEffect(() => {
    const onLovers = (data: { markedPlayerIds?: string[]; partnerName?: string | null }) =>
      setLovers({ markedPlayerIds: data?.markedPlayerIds ?? [], partnerName: data?.partnerName ?? null });
    const onVotes = (data: { entries?: { targetId: string; confirmed: boolean }[] }) =>
      setWerewolfVotes(data?.entries ?? []);
    const request = () => {
      socket.emit("lovers:state:request");
      socket.emit("werewolf-vote:request");
    };
    socket.on("lovers:state", onLovers);
    socket.on("werewolf-vote:status", onVotes);
    socket.on("connect", request);
    request();
    return () => {
      socket.off("lovers:state", onLovers);
      socket.off("werewolf-vote:status", onVotes);
      socket.off("connect", request);
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
      {lovers.partnerName && <p className="game-scene__role-message">💞 Verliebt mit {lovers.partnerName}</p>}
      <div className="game-scene__content">

        {phase === "finished" && gameResult && (
          <div className="game-scene__game-result" role="status">
            <strong>{gameResult.winner === "werewolves" ? "🐺 Die Werwölfe gewinnen!" :
              gameResult.winner === "lovers" ? "💞 Die Verliebten gewinnen!" :
              gameResult.winner === "village" ? "🏡 Das Dorf gewinnt!" :
              `🏆 ${gameResult.winnerLabel ?? gameResult.winner} gewinnt!`}</strong>
            <small>{gameResult.autoRestartOnWin
              ? "Neue Runde startet gleich in der Lobby."
              : "Der Gamemaster kann die Runde in der Lobby zurücksetzen."}</small>
          </div>
        )}
        <CameraLayer players={players} viewerRole={userRole} phase={phase}
          visibleFrames={visibleFrames}
          loverMarkedPlayerIds={lovers.markedPlayerIds}
          werewolfVotes={werewolfVotes}
          focusedPlayerIds={focusedPlayerIds}
          vote={vote}
          roleAction={phase === "night" && userRole === "player" ? roleAction : null}
          maskNightCameras={maskNightCameras} />
        <AnimationLayer />
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
