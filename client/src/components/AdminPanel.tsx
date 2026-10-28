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
import "./AdminPanelTop.css";
import { socket } from "../socket";
import type { DistributionStatus, DistributionUpdate } from "./RoleDistributionSettings";

type AdminPanelProps = {
  players: PublicPlayer[];
  phaseControl: PhaseControlView;
  onPhaseAdvance: () => void;
  onVoteRepeat: () => void;
  distribution: DistributionStatus | null;
  onDistributionChange: (update: DistributionUpdate) => void;
};

export default function AdminPanel({ players, phaseControl, onPhaseAdvance, onVoteRepeat, distribution, onDistributionChange }: AdminPanelProps) {
  return (
    <section className="admin-panel">
      <div className="admin-panel__content">
        <div className="admin-panel__top-row">
          <PhaseRemotePanel view={phaseControl} onAdvance={onPhaseAdvance} onRepeat={onVoteRepeat} />
          <GlobalPanicButton />
        </div>
        <RoleAssignmentPanel players={players} distribution={distribution}
          onDistributionChange={onDistributionChange} connected={phaseControl.connected} />
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
