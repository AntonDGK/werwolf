import type { GamePhase, UserRole } from "../types/Types";
import type { PublicPlayer } from "../types/Player";
import { useEffect, useMemo, useState } from "react";
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
  const [resultClosed, setResultClosed] = useState(false);
  const [gameResult, setGameResult] = useState<{
    winner: string;
    winnerLabel?: string;
    checkpoint: "day-vote" | "night-end";
    autoRestartOnWin: boolean;
  } | null>(null);
  const [maskNightCameras, setMaskNightCameras] = useState(false);
  const [nightVisiblePlayerIds, setNightVisiblePlayerIds] = useState<string[]>([]);
  const [visibleFrames, setVisibleFrames] = useState<Record<string, string>>({});
  const [focusedPlayerIds, setFocusedPlayerIds] = useState<string[]>([]);
  const [roleAction, setRoleAction] = useState<RoleActionState | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [lovers, setLovers] = useState<{ markedPlayerIds: string[]; partnerName: string | null }>({
    markedPlayerIds: [], partnerName: null,
  });
  const [werewolfVotes, setWerewolfVotes] = useState<{ targetId: string; confirmed: boolean }[]>([]);
  const [heldDeathPlayerIds, setHeldDeathPlayerIds] = useState<string[]>([]);
  const displayedPlayers = useMemo(() => players.map(player =>
    heldDeathPlayerIds.includes(player.id) ? { ...player, isAlive: true } : player,
  ), [players, heldDeathPlayerIds]);

  useEffect(() => {
    const onDisplay = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      const ids = (value as { targetPlayerIds?: unknown }).targetPlayerIds;
      if (Array.isArray(ids) && ids.length <= 64 && ids.every(id => typeof id === "string")) {
        setHeldDeathPlayerIds(ids);
      }
    };
    const request = () => socket.emit("day:death-display:request");
    socket.on("day:death-display", onDisplay);
    socket.on("connect", request);
    request();
    return () => {
      socket.off("day:death-display", onDisplay);
      socket.off("connect", request);
    };
  }, []);

  useEffect(() => {
    const onState = (value: RoleActionState) => {
      setRoleAction(value);
      setRoleError(null);
    };
    const onError = (message: string) => setRoleError(message);
    const request = () => socket.emit("role:state:request");
    socket.on("role:state", onState);
    socket.on("role:error", onError);
    socket.on("connect", request);
    request();
    return () => {
      socket.off("role:state", onState);
      socket.off("role:error", onError);
      socket.off("connect", request);
    };
  }, []);

  useEffect(() => {
    setRoleAction(null);
    setRoleError(null);
    socket.emit("role:state:request");
  }, [phase, userRole, privateRole?.roleId]);

  useEffect(() => {
    if (phase !== "finished") setResultClosed(false);
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
    const onViewSettings = (data: { maskNightCameras?: boolean; nightVisiblePlayerIds?: string[] }) => {
      setMaskNightCameras(data?.maskNightCameras === true);
      setNightVisiblePlayerIds(Array.isArray(data?.nightVisiblePlayerIds)
        ? data.nightVisiblePlayerIds.filter(id => typeof id === "string") : []);
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

      <div className="game-scene__content">

        {phase === "finished" && gameResult && !resultClosed && (
          <div className="game-scene__result-overlay">
            <div className="game-scene__game-result" role="dialog" aria-modal="true" aria-labelledby="game-scene__winner-title">
              <button type="button" className="game-scene__result-close"
                aria-label="Ergebnis schließen und Rollen ansehen" onClick={() => setResultClosed(true)}>×</button>
              <strong id="game-scene__winner-title">{gameResult.winner === "werewolves" ? "🐺 Die Werwölfe gewinnen!" :
                gameResult.winner === "lovers" ? "💞 Die Verliebten gewinnen!" :
                gameResult.winner === "village" ? "🏡 Das Dorf gewinnt!" :
                `🏆 ${gameResult.winnerLabel ?? gameResult.winner} gewinnt!`}</strong>
            </div>
          </div>
        )}
        <CameraLayer players={displayedPlayers} viewerRole={userRole} phase={phase}
          visibleFrames={visibleFrames}
          loverMarkedPlayerIds={lovers.markedPlayerIds}
          werewolfVotes={werewolfVotes}
          focusedPlayerIds={focusedPlayerIds}
          vote={vote}
          roleAction={phase === "night" && userRole === "player" ? roleAction : null}
          maskNightCameras={maskNightCameras} nightVisiblePlayerIds={nightVisiblePlayerIds} />
        <AnimationLayer />
      </div>

      <footer className="game-scene__footer">
        {roleError && <span className="game-scene__role-error" role="alert">{roleError}</span>}
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
