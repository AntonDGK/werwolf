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
  question,
  buzzerWinner,
  onBuzz,
}: BuzzerFragenProps) {
  return (
    <section className="buzzer-fragen">
      <h1 className="question-title">{question.question}</h1>
      <button
        className="buzz-button"
        type="button"
        onClick={onBuzz}
        disabled={buzzerWinner !== null}
      >
        Buzzern
      </button>
      {buzzerWinner && (
        <p className="buzzer-winner">
          {buzzerWinner.playerName}

          {buzzerWinner.groupName && (
            <> aus {buzzerWinner.groupName}</>
          )}{" "}
          hat gebuzzert.
        </p>
      )}


    </section>
  );
}

export default BuzzerFragen;