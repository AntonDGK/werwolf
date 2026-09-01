import "./BuzzerFragen.css";

import type {
  BuzzerWinner,
  Question,
} from "../types/Quiz";

type BuzzerFragengmProps = {
  question: Question;
  buzzerWinner: BuzzerWinner | null;
  onResetBuzzer: () => void;
};

function BuzzerFragengm({
  question,
  buzzerWinner,
  onResetBuzzer,
}: BuzzerFragengmProps) {
  return (
    <section className="buzzer-fragen">
      <h2 className="buzzer-heading">Buzzer-Verwaltung</h2>

      <div className="buzzer-solution">
        <h3 className="buzzer-solution-label">
          Richtige Antwort
        </h3>

        <p className="answer-field">
          {question.answer}
        </p>
      </div>

      <div className="buzzer-feedback" aria-live="polite">
        {buzzerWinner ? (
          <p className="buzzer-winner">
            {buzzerWinner.playerName}

            {buzzerWinner.groupName && (
              <> aus {buzzerWinner.groupName}</>
            )}{" "}
            hat gebuzzert.
          </p>
        ) : (
          <p className="no-buzzer-winner">
            Noch niemand hat gebuzzert.
          </p>
        )}
      </div>

      {buzzerWinner && (
        <button
          className="reset-buzzer-button"
          type="button"
          onClick={onResetBuzzer}
        >
          Buzzer zurücksetzen
        </button>
      )}
    </section>
  );
}

export default BuzzerFragengm;