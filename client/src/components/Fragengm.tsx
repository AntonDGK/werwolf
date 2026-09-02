import "./Fragen.css";
import QuizBild from "./QuizBild";
import { serverUrl } from "../socket";

import type {
  Question,
  QuestionExtra,
  BuzzerWinner,
  RevealedAnswer,
} from "../types/Quiz";

import StandardFragengm from "./StandardFragengm.tsx";
import BuzzerFragengm from "./BuzzerFragengm.tsx";
import TextFragengm from "./TextFragengm.tsx";

type FragengmProps = {
  question: Question;
  onRevealAnswer: () => void;
  onRevealNextPicture: () => void;
  onPlayAudio: (extraIndex: number) => void;
  onPauseAudio: () => void;
  onResetAudio: () => void;
  buzzerWinner: BuzzerWinner | null;
  onResetBuzzer: () => void;
  submittedTeamTexts: {
    name: string;
    text: string;
  }[];
  onRevealTeamTexts: () => void;
  revealedAnswer: RevealedAnswer | null;
  revealedScrollPictures: QuestionExtra[];
};

function Fragengm({
  question,
  revealedAnswer,
  revealedScrollPictures,
  onRevealAnswer,
  onRevealNextPicture,
  onPlayAudio,
  onPauseAudio,
  onResetAudio,
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

  // Normale Bilder und alle bereits freigegebenen Scrollbilder.
  const questionPictures = [
    ...question.extras.filter(
      (extra) => extra.type === "picture" && extra.url
    ),
    ...revealedScrollPictures.filter(
      (extra) =>
        extra.type === "picturescroll" && extra.url
    ),
  ];

  const hasScrollPictures = question.extras.some(
    (extra) => extra.type === "picturescroll"
  );

  // Originalindex erhalten: Der Server erwartet den Index
  // innerhalb der vollständigen Extras-Liste.
  const audioExtras = question.extras
    .map((extra, extraIndex) => ({
      extra,
      extraIndex,
    }))
    .filter(({ extra }) => extra.type === "audio");

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
          <p className="fragen-label"></p>

          <h2 className="fragen-text">
            {question.question}
          </h2>
        </header>

        {questionPictures.map((extra) => (
          <div
            className="fragen-bildbereich"
            key={extra.url}
          >
            <QuizBild
              src={new URL(extra.url!, serverUrl).href}
              alt="Bild zur Frage"
            />
          </div>
        ))}

        <div className="fragen-aktion">
          {audioExtras.length > 0 && (
            <div className="audio-steuerung">
              <h3 className="fragen-label">Audio</h3>

              <div
                className="audio-buttons"
                role="group"
                aria-label="Audiosteuerung"
              >
                {audioExtras.map(({ extraIndex }, index) => (
                  <button
                    key={extraIndex}
                    className="audio-icon-button audio-icon-play"
                    type="button"
                    onClick={() => onPlayAudio(extraIndex)}
                    title={`Audio ${index + 1} starten / fortsetzen`}
                    aria-label={`Audio ${index + 1} starten oder fortsetzen`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>

                    {audioExtras.length > 1 && (
                      <span className="audio-nummer">
                        {index + 1}
                      </span>
                    )}
                  </button>
                ))}

                <button
                  className="audio-icon-button"
                  type="button"
                  onClick={onPauseAudio}
                  title="Aktuelles Audio pausieren"
                  aria-label="Aktuelles Audio pausieren"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <rect
                      x="6"
                      y="5"
                      width="4"
                      height="14"
                      rx="1"
                    />
                    <rect
                      x="14"
                      y="5"
                      width="4"
                      height="14"
                      rx="1"
                    />
                  </svg>
                </button>

                <button
                  className="audio-icon-button"
                  type="button"
                  onClick={onResetAudio}
                  title="Aktuelles Audio stoppen und zurücksetzen"
                  aria-label="Aktuelles Audio stoppen und zurücksetzen"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <rect
                      x="5"
                      y="5"
                      width="14"
                      height="14"
                      rx="2"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {hasScrollPictures && (
            <button
              className="next-picture-button"
              type="button"
              onClick={onRevealNextPicture}
            >
              Nächstes Bild zeigen
            </button>
          )}
          <button
            className="reveal-answer-button"
            type="button"
            onClick={onRevealAnswer}
            disabled={revealedAnswer?.questionId === question.id}
          >
            {revealedAnswer?.questionId === question.id
              ? "Ergebnis angezeigt"
              : "Ergebnis anzeigen"}
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
              >
                <QuizBild
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