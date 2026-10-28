import type { UserRole } from "../types/Types";
import "./DayVotePanel.css";

export type VoteStatus = {
  state: "idle" | "open" | "closed";
  votesCast: number;
  eligibleVoters: number;
  results: { target: string; votes: number }[];
  winner: string | null;
  canRepeat: boolean;
  myVote: string | null;
};

// Spieler waehlen per Kamera; waehrend der geheimen Wahl keine Live-Zaehler.
export default function DayVotePanel({ status, userRole, error }: {
  status: VoteStatus | null;
  userRole: UserRole;
  error: string;
}) {
  if (userRole !== "player") return null;
  return <div className="day-vote" aria-live="polite">
    {status?.state === "open" && <span>
      {status.myVote ? "🗳️ Stimme abgegeben – dieselbe Kamera erneut anklicken zum Zurückziehen" : "🗳️ Stimme abgeben – Kamera anklicken"}
    </span>}
    {status?.state === "closed" && <span>
      {status.winner ? `🗳️ ${status.winner} scheidet aus` : "🗳️ Kein eindeutiges Ergebnis"}
    </span>}
    {error && <span role="alert" className="day-vote__error">{error}</span>}
  </div>;
}
