import type { GamePhase, UserRole } from "../types/Types";
import type { PublicPlayer } from "../types/Player";
import "./GameScene.css";
import CameraLayer from "./CameraLayer";
import RoleNotebook from "./RoleNotebook";

type GameSceneProps = {
  phase: GamePhase;
  name: string;
  userRole: UserRole;
  players: PublicPlayer[];
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

        <CameraLayer players={players} />
      </div>

      <footer className="game-scene__footer">
        <span>{name}</span>
        <span>{userRole}</span>
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
