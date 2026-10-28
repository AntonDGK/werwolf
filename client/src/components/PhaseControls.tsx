import { useEffect, useState } from "react";
import type { GamePhase, UserRole } from "../types/Types";
import type { VoteStatus } from "./DayVotePanel";
import { socket } from "../socket";
import "./PhaseControls.css";

export default function PhaseControls({ phase, userRole, vote }: {
  phase: GamePhase;
  userRole: UserRole;
  vote: VoteStatus | null;
}) {
  const [error, setError] = useState("");
  useEffect(() => {
    const onError = (message: string) => setError(message);
    socket.on("phase:error", onError);
    return () => { socket.off("phase:error", onError); };
  }, []);
  if ((userRole !== "storyteller" && userRole !== "gamemaster") || phase === "finished") return null;
  const nextStepHint = phase === "day"
    ? vote?.state === "idle" ? "Abstimmung starten"
      : vote?.state === "open" ? "Abstimmung schließen und Ergebnis zeigen"
      : "Nacht beginnen"
    : "Zur nächsten Spielphase";
  return <div className="phase-controls">
    <button type="button" title={nextStepHint} onClick={() => { setError(""); socket.emit("phase:advance"); }}>Weiter</button>
    {phase === "day" && vote?.state === "closed" && vote.canRepeat && (
      <button type="button" className="phase-controls__repeat" onClick={() => {
        setError("");
        socket.emit("day-vote:repeat");
      }}>↻ Abstimmung wiederholen</button>
    )}
    {error && <span role="alert">{error}</span>}
  </div>;
}
