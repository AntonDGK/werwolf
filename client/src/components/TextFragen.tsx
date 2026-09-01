import "./TextFragen.css";

import type { PublicQuestion } from "../types/Quiz";

type TextFragenProps = {
  question: PublicQuestion;
  teamText: string;
  onTeamTextChange: (text: string) => void;
  onSubmitTeamText: () => void;
  submittedTeamTexts: {
    name: string;
    text: string;
  }[];
  teamTextsRevealed: boolean;
};

function TextFragen({
  teamText,
  onTeamTextChange,
  onSubmitTeamText,
  submittedTeamTexts,
  teamTextsRevealed,
}: TextFragenProps) {
  return (
    <section className="text-fragen">
      <h2 className="text-fragen-heading">Deine Antwort</h2>

      <label className="text-fragen-eingabe">
        <span>Antwort eingeben</span>

        <textarea
          className="text-fragen-textarea"
          value={teamText}
          onChange={(event) =>
            onTeamTextChange(event.target.value)
          }
          placeholder="Schreibe hier eure Antwort …"
          rows={4}
        />
      </label>

      <button
        className="text-fragen-button"
        type="button"
        onClick={onSubmitTeamText}
        disabled={teamTextsRevealed || teamText.trim() === ""}
      >
        Antwort abgeben
      </button>

      {teamTextsRevealed && (
        <section className="text-fragen-abgaben">
          <h2 className="text-fragen-subheading">
            Abgegebene Antworten
          </h2>

          {submittedTeamTexts.length === 0 ? (
            <p className="text-fragen-hinweis">
              Es wurden keine Antworten abgegeben.
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
      )}
    </section>
  );
}

export default TextFragen;