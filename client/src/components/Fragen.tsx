import "./Fragen.css";

import type {
  PublicQuestion,
  RevealedAnswer,
  BuzzerWinner,
} from "../types/Quiz";

import StandardFragen from "./StandardFragen";
import BuzzerFragen from "./BuzzerFragen";
import TextFragen from "./TextFragen";

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
      questionComponent = (
        <StandardFragen question={question} />
      );
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
      questionComponent = <p>Unbekannter Fragetyp.</p>;
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
          Den gesamten Container nur rendern, wenn ein Bild vorhanden ist:

          <div className="fragen-bildbereich">
            <img
              className="fragen-bild"
              src={...}
              alt={...}
            />
          </div>
        */}
      </section>

      <div className="fragen-interaktion">
        {questionComponent}
      </div>
    </section>
  );
}

export default Fragen;