import "./TextFragen.css";

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
    <section className="text-fragen">
      <h2 className="text-fragen-heading">
        Richtige Antwort
      </h2>

      <p className="text-fragen-loesung">
        {question.answer}
      </p>

      <section className="text-fragen-abgaben">
        <h2 className="text-fragen-subheading">
          Abgegebene Antworten
        </h2>

        {submittedTeamTexts.length === 0 ? (
          <p className="text-fragen-hinweis">
            Noch keine Antworten abgegeben.
          </p>
        ) : (
          <div className="text-fragen-liste">
            {submittedTeamTexts.map((answer) => (
              <article
                className="text-fragen-teamantwort"
                key={answer.name}
              >
                <h3>{answer.name}</h3>
                <p>{answer.text}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <button
        className="text-fragen-button"
        type="button"
        onClick={onRevealTeamTexts}
      >
        Spielerantworten anzeigen
      </button>
    </section>
  );
}

export default TextFragengm;