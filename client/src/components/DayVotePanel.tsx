import { useEffect, useState } from "react";
import type { PublicPlayer } from "../types/Player";
import type { UserRole } from "../types/Types";
import { socket } from "../socket";
import "./DayVotePanel.css";

type VoteResult = { target: string; votes: number };
type VoteStatus = {
  state: "idle" | "open" | "closed" | "resolved";
  votesCast: number;
  eligibleVoters: number;
  results: VoteResult[];
  winner: string | null;
  myVote: string | null;
};

export default function DayVotePanel({ players, userRole }: {
  players: PublicPlayer[];
  userRole: UserRole;
}) {
  const [status, setStatus] = useState<VoteStatus | null>(null);
  const [error, setError] = useState("");
  const controller = userRole === "storyteller" || userRole === "gamemaster";
  const me = players.find(p => p.id === socket.id && p.userRole === "player");
  const canVote = userRole === "player" && me?.isAlive === true;
  const eligible = players.filter(p => p.userRole === "player" && p.isAlive);

  useEffect(() => {
    const onStatus = (value: VoteStatus) => setStatus(value);
    const onError = (value: string) => setError(value);
    socket.on("day-vote:status", onStatus);
    socket.on("day-vote:error", onError);
    socket.emit("day-vote:request");
    return () => {
      socket.off("day-vote:status", onStatus);
      socket.off("day-vote:error", onError);
    };
  }, []);

  const action = (eventName: string, arg?: string) => {
    setError("");
    if (arg === undefined) socket.emit(eventName);
    else socket.emit(eventName, arg);
  };

  return (
    <section className="day-vote" aria-label="Dorfabstimmung">
      <h3>🗳️ Dorfabstimmung</h3>
      {!status || status.state === "idle" ? (
        <>
          <p>Die Abstimmung hat noch nicht begonnen.</p>
          {controller && <button onClick={() => action("day-vote:start")}>Abstimmung starten</button>}
        </>
      ) : (
        <>
          <p>Stimmen abgegeben: {status.votesCast} / {status.eligibleVoters} · {status.state === "open" ? "Abstimmung läuft" : "Abstimmung beendet"}</p>
          {status.state === "open" && canVote && (
            <div className="day-vote__targets">
              {eligible.map(p => <button key={p.id} className={status.myVote === p.name ? "day-vote__chosen" : ""} onClick={() => action("day-vote:cast", p.id)}>
                {p.name} {status.myVote === p.name ? "✓" : ""}
              </button>)}
            </div>
          )}
          {status.state === "open" && !canVote && !controller && <p>Du kannst nicht abstimmen.</p>}
          {status.state === "open" && controller && <button onClick={() => action("day-vote:close")}>Abstimmung schließen</button>}
          {(status.state === "closed" || status.state === "resolved") && (
            <>
              <ul className="day-vote__results">
                {status.results.map(result => <li key={result.target}>{result.target}: {result.votes} Stimme(n)</li>)}
              </ul>
              {!status.results.length && <p>Keine Stimmen abgegeben.</p>}
              {status.state === "closed" && <p>{status.winner ? `Meiste Stimmen: ${status.winner}` : "Gleichstand oder keine Stimmen – niemand scheidet automatisch aus."}</p>}
              {status.state === "resolved" && <p>Ergebnis bestätigt. Der Erzähler kann die nächste Phase starten.</p>}
              {status.state === "closed" && controller && status.winner && <button onClick={() => action("day-vote:apply")}>Ausscheiden von {status.winner} bestätigen</button>}
              {status.state === "closed" && controller && <button onClick={() => action("day-vote:start")}>Abstimmung wiederholen</button>}
            </>
          )}
        </>
      )}
      {error && <p role="alert" className="day-vote__error">{error}</p>}
    </section>
  );
}
