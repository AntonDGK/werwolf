import "./StandardFragen.css";

import type { PublicQuestion } from "../types/Quiz";

type StandardFragenProps = {
  question: PublicQuestion;
};

function StandardFragen(_props: StandardFragenProps) {
  return (
    <section className="standard-fragen">
      <h2 className="standard-heading">Deine Antwort</h2>

      <p className="standard-hinweis">
        Beantworte die Frage mündlich.
      </p>

      <p className="standard-status">
        Die Auflösung erscheint nach Freigabe durch den Spielleiter.
      </p>
    </section>
  );
}

export default StandardFragen;