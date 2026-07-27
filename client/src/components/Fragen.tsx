import type {
  PublicQuestion,
  RevealedAnswer,
  BuzzerWinner,
} from "../types/Quiz";

import StandardFragen from "./StandardFragen.tsx";
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
      questionComponent = (
        <StandardFragen
          question={question}
        />
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
      questionComponent = (
        <section>
          <p>
            Unbekannter Fragetyp.
          </p>
        </section>
      );
  }

  const isAnswerForCurrentQuestion =
    revealedAnswer?.questionId ===
    question.id;

  return (
    <section>
      {questionComponent}

      {isAnswerForCurrentQuestion && (
        <section>
          <p>
            {revealedAnswer.answer}
          </p>
        </section>
      )}
    </section>
  );
}

export default Fragen;