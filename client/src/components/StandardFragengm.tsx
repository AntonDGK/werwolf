import type { Question } from "../types/Quiz";

type StandardFragengmProps = {
  question: Question;
};

function StandardFragengm({
  question,
}: StandardFragengmProps) {
  return (
    <section>
      <h1>{question.question}</h1>

      <h2>Antwort</h2>

      <p>{question.answer}</p>
    </section>
  );
}

export default StandardFragengm;