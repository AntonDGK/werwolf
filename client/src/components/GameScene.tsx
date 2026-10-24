import type { GamePhase, UserRole } from "../types/Types";
import type { PublicPlayer } from "../types/Player";
import "./GameScene.css";

type GameSceneProps = {
  phase: GamePhase;
  name: string;
  userRole: UserRole;
  players: PublicPlayer[];
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
}: GameSceneProps) {
  return (
    <section className="game-scene" data-phase={phase}>
      <header className="game-scene__header">
        <h1>🐺🐺🐺🐺🐺</h1>
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

        <div className="game-scene__players">
          {players.map((player) => (
            <div className="game-scene__player" key={player.id}>
              <div className="game-scene__camera-placeholder">📹</div>
              <div className="game-scene__player-name">{player.name}</div>
            </div>
          ))}
        </div>
      </div>

      <footer className="game-scene__footer">
        <span>{name}</span>
        <span>{userRole}</span>
      </footer>
    </section>
  );
}
