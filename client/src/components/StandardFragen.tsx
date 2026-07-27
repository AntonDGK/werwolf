import type { PublicQuestion } from "../types/Quiz";

type StandardFragenProps = {
  question: PublicQuestion;
};

function StandardFragen({
  question,
}: StandardFragenProps) {
  return (
    <header>
      <h1>{question.question}</h1>
    </header>
  );
}

export default StandardFragen;