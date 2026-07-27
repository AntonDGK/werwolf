import type { PublicQuizData } from "../types/Quiz";

type BoardProps = {
  quiz: PublicQuizData;
  usedQuestionIds?: string[];
};

function Board({
  quiz,
  usedQuestionIds = [],
}: BoardProps) {
  return (
    <section className="quiz-board">
      {quiz.categories.map((category) => (
        <div
          key={category.id}
          className="quiz-category"
        >
          <h3>{category.name}</h3>

          {category.questions.map((question) => {
            const isUsed =
              usedQuestionIds.includes(
                question.id
              );

            return (
              <div
                key={question.id}
                className={
                  isUsed
                    ? "question-field-used"
                    : "question-field"
                }
              >
                {question.points}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

export default Board;