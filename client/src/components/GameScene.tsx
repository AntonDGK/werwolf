import type { GamePhase, UserRole } from "../types/Types";
import type { PublicPlayer } from "../types/Player";
import "./GameScene.css";
import CameraLayer from "./CameraLayer";
import RoleNotebook from "./RoleNotebook";
import PhaseControls from "./PhaseControls";
import DayVotePanel from "./DayVotePanel";

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
  return (
    <section className="game-scene" data-phase={phase}>
      <header className="game-scene__header">
        <h1>🐺 Werwolf Engine</h1>
        <span>{phaseLabels[phase]}</span>
      </header>

      <div className="game-scene__content">
        <h2>
          {phase === "night"
            ? "🌙 Das Dorf schläft"
            : phase === "day"
              ? "☀️ Das Dorf erwacht"
              : phaseLabels[phase]}
        </h2>

        <PhaseControls phase={phase} userRole={userRole} />
        <CameraLayer players={players} />
        {phase === "day" && <DayVotePanel players={players} userRole={userRole} />}
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
