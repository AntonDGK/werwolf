import type { GamePhase, UserRole } from "../types/Types";
import type { PublicPlayer } from "../types/Player";
import { useEffect, useState } from "react";
import { socket } from "../socket";
import "./GameScene.css";
import "./GameResult.css";
import CameraLayer from "./CameraLayer";
import RoleNotebook from "./RoleNotebook";
import DayVotePanel, { type VoteStatus } from "./DayVotePanel";

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

const phaseLabels: Record<GamePhase, string> = {
  lobby: "Lobby",
  preparation: "Vorbereitung",
  night: "Nacht",
  day: "Tag",
  finished: "Spiel beendet",
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
  const [voteError, setVoteError] = useState("");
  const [elimination, setElimination] = useState<{playerId: string; sequence: number} | null>(null);
  const [revealGamemasterRoles, setRevealGamemasterRoles] = useState(false);
  const [maskNightCameras, setMaskNightCameras] = useState(false);
  const [gamemasterAssignments, setGamemasterAssignments] = useState<Record<string, string | null>>({});
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
    const onStatus = (next: VoteStatus) => { setVote(next); setVoteError(""); };
    const onError = (message: string) => setVoteError(message);
    const onEliminated = (event: { playerId?: string }) => {
      if (typeof event?.playerId !== "string") return;
      setElimination(previous => ({
        playerId: event.playerId!,
        sequence: (previous?.sequence ?? 0) + 1,
      }));
    };
    socket.on("day-vote:status", onStatus);
    socket.on("day-vote:error", onError);
    socket.on("day-vote:eliminated", onEliminated);
    socket.emit("day-vote:request");
    return () => {
      socket.off("day-vote:status", onStatus);
      socket.off("day-vote:error", onError);
      socket.off("day-vote:eliminated", onEliminated);
    };
  }, []);

  useEffect(() => {
    const onViewSettings = (data: { revealGamemasterRoles?: boolean; maskNightCameras?: boolean }) => {
      setRevealGamemasterRoles(data?.revealGamemasterRoles === true);
      setMaskNightCameras(data?.maskNightCameras === true);
    };
    const onAssignments = (data: { playerId: string; roleId: string | null }[]) => {
      if (userRole !== "gamemaster" || !Array.isArray(data)) return;
      setGamemasterAssignments(Object.fromEntries(
        data.filter(x => typeof x?.playerId === "string" &&
          (x.roleId === null || typeof x.roleId === "string"))
          .map(x => [x.playerId, x.roleId])
      ));
    };
    const onConnect = () => {
      socket.emit("scene:viewer-settings:request");
      if (userRole === "gamemaster") socket.emit("game-role:request");
    };
    socket.on("scene:viewer-settings", onViewSettings);
    socket.on("game-role:assignments", onAssignments);
    socket.on("connect", onConnect);
    onConnect();
    return () => {
      socket.off("scene:viewer-settings", onViewSettings);
      socket.off("game-role:assignments", onAssignments);
      socket.off("connect", onConnect);
    };
  }, [userRole]);

  return (
    <section className="game-scene" data-phase={phase}>
      <header className="game-scene__header">
        <h1>🐺 Werwolf Engine</h1>
        <span>{phaseLabels[phase]}</span>
      </header>

      <div className="game-scene__content">
        {userRole !== "storyteller" && <h2>
          {phase === "night"
            ? "🌙 Das Dorf schläft"
            : phase === "day"
              ? "☀️ Das Dorf erwacht"
              : phaseLabels[phase]}
        </h2>}

        {phase === "finished" && gameResult && (
          <div className="game-scene__game-result" role="status">
            <strong>{gameResult.winner === "werewolves" ? "🐺 Die Werwölfe gewinnen!" : "🏡 Das Dorf gewinnt!"}</strong>
            <small>{gameResult.autoRestartOnWin
              ? "Neue Runde startet gleich in der Lobby."
              : "Der Gamemaster kann die Runde in der Lobby zurücksetzen."}</small>
          </div>
        )}
        <CameraLayer players={players} viewerRole={userRole} phase={phase}
          privateRoleId={privateRole?.roleId} teammateIds={teammates.map(p => p.id)}
          vote={vote} elimination={elimination}
          revealGamemasterRoles={revealGamemasterRoles}
          maskNightCameras={maskNightCameras}
          gamemasterAssignments={gamemasterAssignments} />
        {phase === "day" && <DayVotePanel status={vote} userRole={userRole} error={voteError} />}
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
        <RoleNotebook />
      </footer>
    </section>
  );
}
