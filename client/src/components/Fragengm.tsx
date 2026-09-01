import "./Fragen.css";
import { serverUrl } from "../socket";

import type {
  Question,
  BuzzerWinner,
  RevealedAnswer,
} from "../types/Quiz";

import StandardFragengm from "./StandardFragengm.tsx";
import BuzzerFragengm from "./BuzzerFragengm.tsx";
import TextFragengm from "./TextFragengm.tsx";

type FragengmProps = {
  question: Question;
  onRevealAnswer: () => void;
  buzzerWinner: BuzzerWinner | null;
  onResetBuzzer: () => void;
  submittedTeamTexts: {
    name: string;
    text: string;
  }[];
  onRevealTeamTexts: () => void;
  revealedAnswer: RevealedAnswer | null;
};

function Fragengm({
  question,
  revealedAnswer,
  onRevealAnswer,
  buzzerWinner,
  onResetBuzzer,
  submittedTeamTexts,
  onRevealTeamTexts,
}: FragengmProps) {
  let questionComponent;

  switch (question.type) {
    case "standard":
      questionComponent = (
        <StandardFragengm question={question} />
      );
      break;

    case "buzzer":
      questionComponent = (
        <BuzzerFragengm
          question={question}
          buzzerWinner={buzzerWinner}
          onResetBuzzer={onResetBuzzer}
        />
      );
      break;

    case "text":
      questionComponent = (
        <TextFragengm
          question={question}
          submittedTeamTexts={submittedTeamTexts}
          onRevealTeamTexts={onRevealTeamTexts}
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

  const questionPictures = question.extras.filter(
    (extra) => extra.type === "picture" && extra.url
  );

  const revealedPictures =
    revealedAnswer?.questionId === question.id
      ? revealedAnswer.extras.filter(
          (extra) =>
            extra.type === "revealpicture" && extra.url
        )
      : [];

  return (
    <section className="fragen-layout fragen-layout-gm">
      <section className="fragen-karte">
        <header className="fragen-kopf">
          <p className="fragen-label">Frage</p>

          <h2 className="fragen-text">
            {question.question}
          </h2>
        </header>

        {questionPictures.map((extra) => (
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

        <div className="fragen-aktion">
          <button
            className="reveal-answer-button"
            type="button"
            onClick={onRevealAnswer}
          >
            Ergebnis anzeigen
          </button>
        </div>
      </section>

      <div className="fragen-interaktion">
        {questionComponent}

        {revealedPictures.length > 0 && (
          <section className="antwort">
            <h2>Auflösungsbilder</h2>

            {revealedPictures.map((extra) => (
              <div
                className="fragen-bildbereich"
                key={extra.url}
                style={{ marginTop: "20px" }}
              >
                <img
                  className="fragen-bild"
                  src={new URL(extra.url!, serverUrl).href}
                  alt="Bild zur Auflösung"
                />
              </div>
            ))}
          </section>
        )}
      </div>
    </section>
  );
}

export default Fragengm;