import type { GamePhase, UserRole } from "../types/Types";
import type { PublicPlayer } from "../types/Player";
import { useEffect, useState } from "react";
import { socket } from "../socket";
import "./GameScene.css";
import CameraLayer from "./CameraLayer";
import RoleNotebook from "./RoleNotebook";
import PhaseControls from "./PhaseControls";
import DayVotePanel, { type VoteStatus } from "./DayVotePanel";

type GameSceneProps = {
  phase: GamePhase;
  name: string;
  userRole: UserRole;
  players: PublicPlayer[];
  privateRole?: { roleId: string | null; name: string | null };
  teammates?: { id: string; name: string }[];
  onOpenCamera?: () => void;
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
  name,
  userRole,
  players,
  privateRole,
  teammates = [],
  onOpenCamera,
}: GameSceneProps) {
  const [vote, setVote] = useState<VoteStatus | null>(null);
  const [voteError, setVoteError] = useState("");
  useEffect(() => {
    const onStatus = (next: VoteStatus) => { setVote(next); setVoteError(""); };
    const onError = (message: string) => setVoteError(message);
    socket.on("day-vote:status", onStatus);
    socket.on("day-vote:error", onError);
    socket.emit("day-vote:request");
    return () => {
      socket.off("day-vote:status", onStatus);
      socket.off("day-vote:error", onError);
    };
  }, []);
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

        <PhaseControls phase={phase} userRole={userRole} />
        <CameraLayer players={players} viewerRole={userRole} phase={phase}
          privateRoleId={privateRole?.roleId} teammateIds={teammates.map(p => p.id)} vote={vote} />
        {phase === "day" && <DayVotePanel status={vote} userRole={userRole} error={voteError} />}
      </div>

      <footer className="game-scene__footer">
        <span>{name}</span>
        <span>{userRole}</span>
        {userRole === "player" && privateRole?.name && (
          <span title="Nur deine eigene Rolle">🎭 {privateRole.name}</span>
        )}
        {userRole === "player" && privateRole?.roleId === "werewolf" && teammates.length > 0 && (
          <span title="Nur für Werwölfe sichtbar">🐺 Team: {teammates.map((p) => p.name).join(", ")}</span>
        )}
        <RoleNotebook />
        {userRole !== "gamemaster" && onOpenCamera && (
          <button type="button" onClick={onOpenCamera} aria-label="Kameraeinstellungen öffnen">
            ⚙️ Kamera
          </button>
        )}
      </footer>
    </section>
  );
}
