import { useEffect, useState } from "react";
import type { GamePhase, UserRole } from "../types/Types";
import { socket } from "../socket";
import "./PhaseControls.css";

type PhaseStatus = { phase: GamePhase; round: number; step: string | null };

export default function PhaseControls({ phase, userRole }: { phase: GamePhase; userRole: UserRole }) {
  const [status, setStatus] = useState<PhaseStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const onStatus = (value: PhaseStatus) => {
      if (value && typeof value.phase === "string" && typeof value.round === "number") setStatus(value);
    };
    const onError = (value: string) => setError(value);
    socket.on("phase:step:changed", onStatus);
    socket.on("phase:error", onError);
    return () => {
      socket.off("phase:step:changed", onStatus);
      socket.off("phase:error", onError);
    };
  }, []);

  if (userRole !== "storyteller" && userRole !== "gamemaster") return null;
  const setPhase = (next: GamePhase) => { setError(""); socket.emit("phase:set", next); };
  return (
    <section className="phase-controls" aria-label="Spielablauf-Steuerung">
      <strong>🎙️ Spielablauf</strong>
      <span>Phase: {phase} · Runde: {status?.round ?? "–"}
        {phase === "night" ? ` · Nachtabschnitt: ${status?.step ?? "noch keiner / abgeschlossen"}` : ""}
      </span>
      <div className="phase-controls__buttons">
        {phase === "lobby" && <button onClick={() => setPhase("preparation")}>Vorbereitung starten</button>}
        {phase === "preparation" && <button onClick={() => setPhase("night")}>🌙 Nacht starten</button>}
        {phase === "night" && <>
          <button onClick={() => socket.emit("phase:step:next")}>Weiter: Nachtabschnitt</button>
          <button onClick={() => setPhase("day")}>☀️ Weiter zum Tag</button>
        </>}
        {phase === "day" && <button onClick={() => setPhase("night")}>🌙 Weiter zur Nacht</button>}
        {phase !== "lobby" && <button onClick={() => setPhase("lobby")}>Zur Lobby / neue Runde</button>}
        {(phase === "day" || phase === "night") && <button onClick={() => setPhase("finished")}>Spiel beenden</button>}
      </div>
      {error && <p role="alert">{error}</p>}
      <small>Phasenwechsel nur per Klick. Nachtaktionen folgen erst später.</small>
    </section>
  );
}
