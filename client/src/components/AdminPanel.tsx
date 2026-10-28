import type { PublicPlayer } from "../types/Player";
import PhaseRemotePanel, { type PhaseControlView } from "./PhaseRemotePanel";
import AccountManager from "./AccountManager";
import StorytellerManager from "./StorytellerManager";
import CameraAdminPanel from "./CameraAdminPanel";
import GlobalPanicButton from "./GlobalPanicButton";
import GameEndSettings from "./GameEndSettings";
import RoleAssignmentPanel from "./RoleAssignmentPanel";
import AdminFrameSettings from "./AdminFrameSettings";
import "./AdminPanel.css";
import "./AdminPanelReset.css";
import { socket } from "../socket";

type AdminPanelProps = {
  players: PublicPlayer[];
  phaseControl: PhaseControlView;
  onPhaseAdvance: () => void;
  onVoteRepeat: () => void;
};

export default function AdminPanel({ players, phaseControl, onPhaseAdvance, onVoteRepeat }: AdminPanelProps) {
  return (
    <section className="admin-panel">
      <div className="admin-panel__content">
        <PhaseRemotePanel view={phaseControl} onAdvance={onPhaseAdvance} onRepeat={onVoteRepeat} />
        <h2>⚙️ Gamemaster-Einstellungen</h2>
        <p>Hier findest du die zusätzlichen Verwaltungsfunktionen.</p>

        {/* Reihenfolge der Adminbereiche bewusst nach Wunsch des Gamemasters. */}
        <GlobalPanicButton />
        <RoleAssignmentPanel players={players} />
        <div className="admin-panel__reset">
          <h2>↩ Lobby zurücksetzen</h2>
          <GameEndSettings />
          <button type="button" onClick={() => {
            if (window.confirm("Wirklich zur Lobby zurückkehren und die Runde zurücksetzen?")) {
              socket.emit("phase:set", "lobby");
            }
          }}>Zur Lobby / Runde zurücksetzen</button>
        </div>
        <AdminFrameSettings />
        <CameraAdminPanel />
        <AccountManager />
        <StorytellerManager players={players} />
      </div>
    </section>
  );
}
