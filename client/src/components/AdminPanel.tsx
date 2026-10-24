import type { PublicPlayer } from "../types/Player";
import AccountManager from "./AccountManager";
import StorytellerManager from "./StorytellerManager";
import "./AdminPanel.css";

type AdminPanelProps = {
  players: PublicPlayer[];
};

export default function AdminPanel({ players }: AdminPanelProps) {
  return (
    <section className="admin-panel">
      <div className="admin-panel__content">
        <h2>⚙️ Gamemaster-Einstellungen</h2>
        <p>Hier findest du die zusätzlichen Verwaltungsfunktionen.</p>

        <StorytellerManager players={players} />
        <AccountManager />
      </div>
    </section>
  );
}
