import "./Fragen.css";
import { serverUrl } from "../socket";
import type {
  PublicQuestion,
  RevealedAnswer,
  BuzzerWinner,
} from "../types/Quiz";

import BuzzerFragen from "./BuzzerFragen.tsx";
import TextFragen from "./TextFragen.tsx";

type FragenProps = {
  question: PublicQuestion;
  revealedAnswer: RevealedAnswer | null;
  buzzerWinner: BuzzerWinner | null;
  onBuzz: () => void;
  teamText: string;
  onTeamTextChange: (text: string) => void;
  onSubmitTeamText: () => void;
  submittedTeamTexts: {
    name: string;
    text: string;
  }[];
  teamTextsRevealed: boolean;
};

function Fragen({
  question,
  revealedAnswer,
  buzzerWinner,
  onBuzz,
  teamText,
  onTeamTextChange,
  onSubmitTeamText,
  submittedTeamTexts,
  teamTextsRevealed,
}: FragenProps) {
  let questionComponent;

  switch (question.type) {
    case "standard":
      questionComponent = null;
      break;

    case "buzzer":
      questionComponent = (
        <BuzzerFragen
          question={question}
          buzzerWinner={buzzerWinner}
          onBuzz={onBuzz}
        />
      );
      break;

    case "text":
      questionComponent = (
        <TextFragen
          question={question}
          teamText={teamText}
          onTeamTextChange={onTeamTextChange}
          onSubmitTeamText={onSubmitTeamText}
          submittedTeamTexts={submittedTeamTexts}
          teamTextsRevealed={teamTextsRevealed}
        />
      );
      break;

    default:
      questionComponent = (
        <section>
          <p>Unbekannter Fragetyp.</p>
        </section>
      );
  }

  const isAnswerForCurrentQuestion =
    revealedAnswer?.questionId === question.id;

  return (
    <section className="fragen-layout">
      <section className="fragen-karte">
        <header className="fragen-kopf">
          <p className="fragen-label">Frage</p>

          <h2 className="fragen-text">
            {question.question}
          </h2>
        </header>

      {question.extras
        .filter(
          (extra) =>
            extra.type === "picture" && extra.url
        )
        .map((extra) => (
          <div
            className="fragen-bildbereich"
            key={extra.url}
          >
            <img
              className="fragen-bild"
              src={new URL(extra.url!, serverUrl).href}
              alt="Bild zur Frage"
            />
          </div>
        ))}
      </section>

      <div className="fragen-interaktion">
        {questionComponent}

        {isAnswerForCurrentQuestion && revealedAnswer && (
          <section className="antwort">
            <h2>Auflösung</h2>
            <p>{revealedAnswer.answer}</p>
          </section>
        )}
      </div>
    </section>
  );
}

export default Fragen;