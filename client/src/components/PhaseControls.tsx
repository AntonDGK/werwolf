import { useEffect, useState } from "react";
import type { GamePhase, UserRole } from "../types/Types";
import { socket } from "../socket";
import "./PhaseControls.css";

export default function PhaseControls({ phase, userRole }: { phase: GamePhase; userRole: UserRole }) {
  const [error, setError] = useState("");
  useEffect(() => {
    const onError = (message: string) => setError(message);
    socket.on("phase:error", onError);
    return () => { socket.off("phase:error", onError); };
  }, []);
  if ((userRole !== "storyteller" && userRole !== "gamemaster") || phase === "finished") return null;
  return <div className="phase-controls">
    <button type="button" onClick={() => { setError(""); socket.emit("phase:advance"); }}>Weiter</button>
    {error && <span role="alert">{error}</span>}
  </div>;
}
