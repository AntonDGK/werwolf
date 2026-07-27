import type { PublicQuizData } from "../types/Quiz";

type BoardgmProps = {
  quiz: PublicQuizData;
  usedQuestionIds?: string[];
  onSelectQuestion: (
    questionId: string,
    points: number
  ) => void;
};

function Boardgm({
  quiz,
  usedQuestionIds = [],
  onSelectQuestion,
}: BoardgmProps) {
  return (
    <section className="quiz-board">
      {quiz.categories.map((category) => (
        <div
          key={category.id}
          className="quiz-category"
        >
          <h3>{category.name}</h3>

          {category.questions.map(
            (question) => {
              const isUsed =
                usedQuestionIds.includes(
                  question.id
                );

              return (
                <button
                  key={question.id}
                  className={
                    isUsed
                      ? "question-field-used"
                      : "question-field"
                  }
                  disabled={isUsed}
                  onClick={() =>
                    onSelectQuestion(
                      question.id,
                      question.points
                    )
                  }
                >
                  {question.points}
                </button>
              );
            }
          )}
        </div>
      ))}
    </section>
  );
}

export default Boardgm;