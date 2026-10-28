import type { PublicPlayer } from "../types/Player";
import AccountManager from "./AccountManager";
import StorytellerManager from "./StorytellerManager";
import CameraAdminPanel from "./CameraAdminPanel";
import AdminDayVotePanel from "./AdminDayVotePanel";
import RoleAssignmentPanel from "./RoleAssignmentPanel";
import AdminFrameSettings from "./AdminFrameSettings";
import "./AdminPanel.css";
import "./AdminPanelReset.css";
import { socket } from "../socket";

type AdminPanelProps = {
  players: PublicPlayer[];
};

export default function AdminPanel({ players }: AdminPanelProps) {
  return (
    <section className="admin-panel">
      <div className="admin-panel__content">
        <h2>⚙️ Gamemaster-Einstellungen</h2>
        <p>Hier findest du die zusätzlichen Verwaltungsfunktionen.</p>

        <AdminDayVotePanel />
        <CameraAdminPanel />
        <AdminFrameSettings />
        <StorytellerManager players={players} />
        <RoleAssignmentPanel players={players} />
        <AccountManager />
        <div className="admin-panel__reset">
          <button type="button" onClick={() => {
            if (window.confirm("Wirklich zur Lobby zurückkehren und die Runde zurücksetzen?")) {
              socket.emit("phase:set", "lobby");
            }
          }}>↩ Zur Lobby / Runde zurücksetzen</button>
        </div>
      </div>
    </section>
  );
}
