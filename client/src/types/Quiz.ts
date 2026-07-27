export type QuestionType =
  | "standard"
  | "buzzer"
  | "text";

export type Question = {
  id: string;
  points: number;
  type: QuestionType;
  question: string;
  answer: string;
  extras: string[];
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

/*
 * Öffentlich
 */

export type PublicQuestion = {
  id: string;
  points: number;
  type: QuestionType;
  question: string;
  extras: string[];
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