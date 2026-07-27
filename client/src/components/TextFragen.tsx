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
  question,
  teamText,
  onTeamTextChange,
  onSubmitTeamText,
  submittedTeamTexts,
  teamTextsRevealed,
}: TextFragenProps) {
  return (
    <section>
      <h1>{question.question}</h1>

      <textarea
        value={teamText}
        onChange={(event) =>
          onTeamTextChange(event.target.value)
        }
        placeholder="Antwort eingeben..."
      />
      <br></br>
      <button
        type="button"
        onClick={onSubmitTeamText}
        disabled={teamTextsRevealed || teamText.trim() === ""}
      >
        Antwort abgeben
      </button>

      {teamTextsRevealed && (
        <section>
          <h2>Abgegebene Antworten</h2>

          {submittedTeamTexts.length === 0 ? (
            <p>
              Es wurden keine Antworten abgegeben.
            </p>
          ) : (
            submittedTeamTexts.map((answer) => (
              <article key={answer.name}>
                <h3>{answer.name}</h3>

                <p>{answer.text}</p>
              </article>
            ))
          )}
        </section>
      )}
    </section>
  );
}

export default TextFragen;