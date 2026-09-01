import "./BuzzerFragen.css";

import type {
  BuzzerWinner,
  PublicQuestion,
} from "../types/Quiz";

type BuzzerFragenProps = {
  question: PublicQuestion;
  buzzerWinner: BuzzerWinner | null;
  onBuzz: () => void;
};

function BuzzerFragen({
  buzzerWinner,
  onBuzz,
}: BuzzerFragenProps) {
  return (
    <section className="buzzer-fragen">
      <h2 className="buzzer-heading">Deine Aktion</h2>

      <p className="buzzer-status">
        <span
          className={`buzzer-status-dot ${
            buzzerWinner ? "is-locked" : ""
          }`}
          aria-hidden="true"
        />
        {buzzerWinner ? "Buzzer gesperrt" : "Bereit"}
      </p>

      <button
        className="buzz-button"
        type="button"
        onClick={onBuzz}
        disabled={buzzerWinner !== null}
      >
        Buzzern
      </button>

      <p className="buzzer-hint">
        Drücke, wenn du die Antwort weißt.
      </p>

      <div className="buzzer-feedback" aria-live="polite">
        {buzzerWinner && (
          <p className="buzzer-winner">
            {buzzerWinner.playerName}

            {buzzerWinner.groupName && (
              <> aus {buzzerWinner.groupName}</>
            )}{" "}
            hat gebuzzert.
          </p>
        )}
      </div>
    </section>
  );
}

export default BuzzerFragen;