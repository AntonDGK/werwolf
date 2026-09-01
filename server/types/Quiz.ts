export type QuestionType =
  | "standard"
  | "buzzer"
  | "text";

export type QuestionExtra = {
  type:
    | "picture"
    | "picturescroll"
    | "audio"
    | "revealpicture";
  file: string;
};

export type Question = {
  id: string;
  points: number;
  type: QuestionType;
  question: string;
  answer: string;
  extras: QuestionExtra[];
};

export type Category = {
  id: string;
  name: string;
  questions: Question[];
};

export type QuizData = {
  title: string;
  categories: Category[];
};

export type RevealedAnswer = {
  questionId: string;
  answer: string;
  extras: QuestionExtra[];
};

/*
 * Öffentlich
 */

export type PublicQuestion = {
  id: string;
  points: number;
  type: QuestionType;
  question: string;
  extras: QuestionExtra[];
};

export type PublicCategory = {
  id: string;
  name: string;
  questions: PublicQuestion[];
};

export type PublicQuizData = {
  title: string;
  categories: PublicCategory[];
};

export type BuzzerWinner = {
  playerId: string;
  playerName: string;
  groupName: string;
};