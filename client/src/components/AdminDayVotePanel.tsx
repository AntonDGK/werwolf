import { useEffect, useState } from "react";
import { socket } from "../socket";
import type { VoteStatus } from "./DayVotePanel";
import "./AdminDayVotePanel.css";

/** Live-Zwischenstaende NUR im Adminbereich (serverseitig berechtigt). */
export default function AdminDayVotePanel() {
  const [vote, setVote] = useState<VoteStatus | null>(null);
  useEffect(() => {
    const onStatus = (status: VoteStatus) => setVote(status);
    socket.on("day-vote:status", onStatus);
    socket.emit("day-vote:request");
    return () => { socket.off("day-vote:status", onStatus); };
  }, []);

  if (!vote || vote.state !== "open") return null;
  return <section className="admin-day-vote" aria-label="Geheime Abstimmung live">
    <h3>🗳️ Laufende Abstimmung (nur Gamemaster)</h3>
    <p>{vote.votesCast} / {vote.eligibleVoters} Stimmen</p>
    <div className="admin-day-vote__results">
      {vote.results.length
        ? vote.results.map(({ target, votes }) => (
          <span key={target}>{target}: <strong>{votes}</strong></span>
        ))
        : <span>Noch keine Stimmen</span>}
    </div>
  </section>;
}
