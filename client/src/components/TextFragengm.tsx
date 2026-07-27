import type { Question } from "../types/Quiz";

type TextFragengmProps = {
  question: Question;
  submittedTeamTexts: {
    name: string;
    text: string;
  }[];
  onRevealTeamTexts: () => void;
};

function TextFragengm({
  question,
  submittedTeamTexts,
  onRevealTeamTexts,
}: TextFragengmProps) {
  return (
    <section>
      <h1>{question.question}</h1>

      <h2>Antwort</h2>
      <p>{question.answer}</p>

      <h2>Abgegebene Antworten</h2>

      {submittedTeamTexts.length === 0 ? (
        <p>Noch keine Antworten abgegeben.</p>
      ) : (
        submittedTeamTexts.map((answer) => (
          <article key={answer.name}>
            <h3>{answer.name}</h3>
            <p>{answer.text}</p>
          </article>
        ))
      )}

      <button
        type="button"
        onClick={onRevealTeamTexts}
      >
        Spielerantworten anzeigen
      </button>
    </section>
  );
}

export default TextFragengm;