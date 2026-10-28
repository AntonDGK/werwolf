import type { GamePhase } from "../types/Types";
import "./PhaseRemotePanel.css";

export type NightTimelineStep = { id: string; label: string };
export type PhaseControlStatus = {
  phase: GamePhase;
  round: number;
  step: string | null;
  nightSteps: NightTimelineStep[];
};
export type PhaseControlVote = {
  state: "idle" | "open" | "closed";
  canRepeat: boolean;
};
export type PhaseControlView = {
  status: PhaseControlStatus | null;
  vote: PhaseControlVote | null;
  connected: boolean;
  error: string;
};

type TimelineItem = { id: string; label: string };

function timeline(status: PhaseControlStatus | null): TimelineItem[] {
  const nights = status?.nightSteps ?? [];
  return [
    { id: "day-start", label: "Tag gestartet" },
    { id: "day-vote", label: "Votingphase" },
    { id: "day-result", label: "After Vote" },
    { id: "night-start", label: "Nachtstart" },
    ...nights.map((step) => ({ id: `night:${step.id}`, label: step.label })),
    { id: "next-day", label: "Nächster Tag" },
  ];
}

function currentId(view: PhaseControlView): string | null {
  if (view.status?.phase === "day") {
    return view.vote?.state === "open" ? "day-vote"
      : view.vote?.state === "closed" ? "day-result" : "day-start";
  }
  if (view.status?.phase === "night") {
    return view.status.step === null ? "night-start" : `night:${view.status.step}`;
  }
  return null;
}

const nonGameLabels: Record<"lobby" | "preparation" | "finished", string> = {
  lobby: "Lobby",
  preparation: "Vorbereitung",
  finished: "Spiel beendet",
};

export default function PhaseRemotePanel({ view, onAdvance, onRepeat }: {
  view: PhaseControlView;
  onAdvance: () => void;
  onRepeat: () => void;
}) {
  const active = currentId(view);
  const items = timeline(view.status);
  const activeIndex = items.findIndex((item) => item.id === active);
  const phase = view.status?.phase;
  const stopped = !view.connected || !phase || phase === "finished";
  const repeat = phase === "day" && view.vote?.state === "closed" && view.vote.canRepeat;

  return (
    <section className="phase-remote" aria-label="Phasensteuerung">
      <header className="phase-remote__header">
        <h2>🎛 Phasensteuerung</h2>
        {view.status && <span>Runde {view.status.round}</span>}
      </header>
      {phase && (phase === "lobby" || phase === "preparation" || phase === "finished") ? (
        <div className="phase-remote__current" aria-live="polite">{nonGameLabels[phase]}</div>
      ) : (
        <ol className="phase-remote__timeline" aria-label="Phasenablauf">
          {items.map((item, index) => (
            <li key={item.id} className={index === activeIndex ? "phase-remote__step phase-remote__step--active" : index < activeIndex ? "phase-remote__step phase-remote__step--past" : "phase-remote__step"}
              aria-current={index === activeIndex ? "step" : undefined}>
              <span aria-hidden="true" className="phase-remote__marker">{index === activeIndex ? "●" : index < activeIndex ? "✓" : "○"}</span>
              <span>{item.label}</span>
            </li>
          ))}
        </ol>
      )}
      {!view.connected && <p className="phase-remote__notice" role="status">Hauptfenster nicht verbunden.</p>}
      {view.error && <p className="phase-remote__error" role="alert">{view.error}</p>}
      <div className="phase-remote__actions">
        <button type="button" className="phase-remote__advance" disabled={stopped} onClick={onAdvance}>▶ WEITER</button>
        {repeat && <button type="button" className="phase-remote__repeat" disabled={!view.connected} onClick={onRepeat}>↻ Abstimmung wiederholen</button>}
      </div>
    </section>
  );
}
