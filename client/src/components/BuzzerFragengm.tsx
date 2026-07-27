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
    <section>
      <h1>{question.question}</h1>

      <h2>Antwort</h2>

      <p>{question.answer}</p>

      {buzzerWinner ? (
      <>
        <p>
        {buzzerWinner.playerName}

        {buzzerWinner.groupName && (
            <> aus {buzzerWinner.groupName}</>
        )}{" "}
        hat gebuzzert.
        </p>

        <button
        type="button"
        onClick={onResetBuzzer}
        >
        Buzzer zurücksetzen
        </button>
    </>
      ) : (
      <p>Noch niemand hat gebuzzert.</p>
      )}
    </section>
  );
}

export default BuzzerFragengm;