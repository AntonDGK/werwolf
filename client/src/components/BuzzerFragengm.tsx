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
      <h1 className="question-title">{question.question}</h1>

      <p className="answer-field">{question.answer}</p>

      {buzzerWinner ? (
      <>
        <p className="buzzer-winner">
        {buzzerWinner.playerName}

        {buzzerWinner.groupName && (
            <> aus {buzzerWinner.groupName}</>
        )}{" "}
        hat gebuzzert.
        </p>

        <button
        className="reset-buzzer-button"
        type="button"
        onClick={onResetBuzzer}
        >
        Buzzer zurücksetzen
        </button>
    </>
      ) : (
      <p className="no-buzzer-winner">Noch niemand hat gebuzzert.</p>
      )}
    </section>
  );
}

export default BuzzerFragengm;