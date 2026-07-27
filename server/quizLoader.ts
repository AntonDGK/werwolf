import fs from "fs";
import path from "path";

import type {
  PublicQuizData,
  Question,
  QuizData,
} from "./types/Quiz";

const quizPath = path.join(
  __dirname,
  "../client/quizfragen/questions.json"
);

export const quiz: QuizData = JSON.parse(
  fs.readFileSync(quizPath, "utf-8")
) as QuizData;

/**
 * Findet eine vollständige Frage anhand ihrer ID.
 *
 * Diese Funktion sollte nur auf dem Server verwendet werden,
 * weil das Ergebnis auch die Antwort enthält.
 */
export function getQuestionById(
  questionId: string
): Question | undefined {
  for (const category of quiz.categories) {
    const question =
      category.questions.find(
        (currentQuestion) =>
          currentQuestion.id ===
          questionId
      );

    if (question) {
      return question;
    }
  }

  return undefined;
}

/**
 * Öffentliche Version des Quiz.
 *
 * Die Antwort und Extras werden nicht
 * an die Clients gesendet.
 */
export function getPublicQuiz(): PublicQuizData {
  return {
    title: quiz.title,

    categories: quiz.categories.map(
      (category) => ({
        id: category.id,
        name: category.name,

        questions: category.questions.map(
          (question) => ({
            id: question.id,
            points: question.points,
            type: question.type,
            question: question.question,
            extras: question.extras,
          })
        ),
      })
    ),
  };
}