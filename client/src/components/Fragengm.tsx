import "./Fragen.css";

import type {
  Question,
  BuzzerWinner,
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
};

function Fragengm({
  question,
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

  return (
    <section className="fragen-layout">
      <section className="fragen-karte">
        <header className="fragen-kopf">
          <p className="fragen-label">Frage</p>

          <h2 className="fragen-text">
            {question.question}
          </h2>
        </header>

        {/*
          Hier später das optionale Bild einfügen.
          Den Bildbereich nur rendern, wenn ein Bild vorhanden ist.

          Vorgesehene Klassen:
          - fragen-bildbereich für den Container
          - fragen-bild für das Bild
        */}

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
      </div>
    </section>
  );
}

export default Fragengm;