import "./StandardFragen.css";

import type { Question } from "../types/Quiz";

type StandardFragengmProps = {
  question: Question;
};

function StandardFragengm({
  question,
}: StandardFragengmProps) {
  return (
    <section className="standard-fragen">
      <h2 className="standard-heading">
        Richtige Antwort
      </h2>

      <p className="standard-loesung">
        {question.answer}
      </p>
    </section>
  );
}

export default StandardFragengm;