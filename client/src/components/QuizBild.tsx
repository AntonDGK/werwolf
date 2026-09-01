import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./QuizBild.css";

type QuizBildProps = {
  src: string;
  alt: string;
};

function QuizBild({ src, alt }: QuizBildProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }

      // Der Fokus bleibt während der Vergrößerung im Dialog.
      if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [isOpen]);

  // Bei einem Bildwechsel die bisherige Vergrößerung schließen.
  useEffect(() => {
    setIsOpen(false);
  }, [src]);

  return (
    <>
      <button
        ref={triggerRef}
        className="quiz-bild-trigger"
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={`${alt} vergrößern`}
        aria-haspopup="dialog"
      >
        <img
          className="fragen-bild"
          src={src}
          alt={alt}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            className="quiz-bild-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Vergrößerte Bildansicht"
            onClick={() => setIsOpen(false)}
          >
            <button
              ref={closeRef}
              className="quiz-bild-schliessen"
              type="button"
              aria-label="Bildansicht schließen"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>

            <img
              className="quiz-bild-gross"
              src={src}
              alt={alt}
              onClick={(event) => event.stopPropagation()}
            />
          </div>,
          document.body
        )}
    </>
  );
}

export default QuizBild;