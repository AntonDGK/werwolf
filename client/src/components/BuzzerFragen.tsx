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
    <section>
      <h1>{question.question}</h1>

      {question.extras.length > 0 && (
        <ul>
          {question.extras.map(
            (extra, index) => (
              <li key={index}>
                {extra}
              </li>
            )
          )}
        </ul>
      )}
      <button
        type="button"
        onClick={onBuzz}
        disabled={buzzerWinner !== null}
      >
        Buzzern
      </button>
      {buzzerWinner && (
        <p>
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