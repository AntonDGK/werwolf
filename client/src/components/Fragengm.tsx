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
  submittedTeamTexts: {name: string; text: string;}[];
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
        <StandardFragengm
          question={question}
        />
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
          <p>
            Unbekannter Fragetyp.
          </p>
        </section>
      );
  }

  return (
    <section>
      <section className="frage">
      {questionComponent}
      </section>
      <section className="antwort">
      <button
        className="reveal-answer-button"
        type="button"
        onClick={onRevealAnswer}
      >
        Ergebnis anzeigen
      </button>
      </section>
    </section>
  );
}

export default Fragengm;