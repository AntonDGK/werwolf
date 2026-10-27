import type { UserRole } from "../types/Types";
import "./DayVotePanel.css";

export type VoteStatus = {
  state: "idle" | "open" | "closed" | "resolved";
  votesCast: number;
  eligibleVoters: number;
  results: { target: string; votes: number }[];
  winner: string | null;
  myVote: string | null;
};

// Keine langen Textfelder und keine Namenslisten: Spieler wählen per Kamera.
// Für den Erzähler erscheint nur der zentrale Weiter-Button (PhaseControls).
export default function DayVotePanel({ status, userRole, error }: {
  status: VoteStatus | null;
  userRole: UserRole;
  error: string;
}) {
  if (userRole !== "player") return null;
  return <div className="day-vote" aria-live="polite">
    {status?.state === "open" && <span>🗳️ Kamera anklicken · {status.votesCast}/{status.eligibleVoters} Stimmen</span>}
    {status?.state === "closed" && <span>🗳️ {status.winner ? `Meiste Stimmen: ${status.winner}` : "Gleichstand / keine Stimmen"}</span>}
    {status?.state === "resolved" && <span>🗳️ Abstimmung abgeschlossen</span>}
    {error && <span role="alert" className="day-vote__error">{error}</span>}
  </div>;
}
