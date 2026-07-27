import { useEffect, useState, useRef } from "react";
import "./App.css";

import type { Player } from "./types/Player";
import type {
  PublicQuestion,
  PublicQuizData,
  Question,
  RevealedAnswer,
  BuzzerWinner,
} from "./types/Quiz";

import JoinScreen from "./components/JoinScreen";
import Lobby from "./components/Lobby";
import Lobbygm from "./components/Lobbygm";
import Scoreboard from "./components/Scoreboard";
import Scoreboardgm from "./components/Scoreboardgm";
import Board from "./components/Board";
import Boardgm from "./components/Boardgm";
import Fragen from "./components/Fragen";
import Fragengm from "./components/Fragengm";

import { socket } from "./socket";

//Hier der geklaute Hintergrund
import { ThpaceGL } from 'thpace';

type GamePhase =
  | "start"
  | "lobby"
  | "board"
  | "frage";

function App() {
  //geklauter Hintergrund
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [phase, setPhase] =
    useState<GamePhase>("start");

  const [players, setPlayers] =
    useState<Player[]>([]);

  const [isGameMaster, setIsGameMaster] =
    useState(false);

  const [pointValue, setPointValue] =
    useState(0);

  const [quiz, setQuiz] =
    useState<PublicQuizData | null>(null);

  const [currentPublicQuestion, setCurrentPublicQuestion,] = 
    useState<PublicQuestion | null>(null);

  const [currentQuestion, setCurrentQuestion,] = 
    useState<Question | null>(null);

  const [usedQuestionIds, setUsedQuestionIds,] = 
    useState<string[]>([]);

  const [revealedAnswer, setRevealedAnswer,] = 
    useState<RevealedAnswer | null>(null);

  const [buzzerWinner, setBuzzerWinner,] = 
    useState<BuzzerWinner | null>(null);

  const [teamText, setTeamText] = 
    useState("");

  const [teamTextsRevealed, setTeamTextsRevealed,] = 
    useState(false);

  const [submittedTeamTexts, setSubmittedTeamTexts,] = 
  useState<{
    name: string;
    text: string;
    }[]
  >([]);
  
  const [currentTeam, setCurrentTeam] =
    useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };

    resizeCanvas();

    const thpace = ThpaceGL.create(canvas, {
      colors: [
        "#442416",
        "#D5AA72",
        "#F5F6ED",
      ],
      triangleSize: 75,
      automaticResize: false,
    });

    window.addEventListener(
      "resize",
      resizeCanvas
    );

    return () => {
      window.removeEventListener(
        "resize",
        resizeCanvas
      );

      const instance = thpace as {
        stop?: () => void;
      };

      instance.stop?.();

      // Kein WEBGL_lose_context verwenden!
    };
  }, []);
    
  useEffect(() => {
    const handleConnect = () => {
      console.log("Socket verbunden:", socket.id);

      socket.emit("requestQuiz");
    };

    const handleJoined = () => {
      console.log("Normaler Spieler beigetreten");

      setIsGameMaster(false);
      setPhase("lobby");
    };

    const handleJoinedAdmin = () => {
      console.log("GameMaster beigetreten");

      setIsGameMaster(true);
      setPhase("lobby");
    };

    const handleAnswerRevealed = (
      answer: RevealedAnswer
    ) => {
      setRevealedAnswer(answer);
    };

    const handlePlayers = (
      serverPlayers: Player[]
    ) => {
      setPlayers(serverPlayers);
    };

    const handlePhaseChange = (
      newPhase: GamePhase
    ) => {
      

      console.log("Neue Spielphase:", newPhase);

      setPhase(newPhase);

      if (
        newPhase === "board" ||
        newPhase === "lobby"
      ) {
        setCurrentPublicQuestion(null);
        setCurrentQuestion(null);
        setRevealedAnswer(null);
        setBuzzerWinner(null);
        setTeamText("");
        setSubmittedTeamTexts([]);
        setTeamTextsRevealed(false);
      }
    };

    const handleQuiz = (
      receivedQuiz: PublicQuizData
    ) => {
      console.log("Quiz empfangen:", receivedQuiz.title);

      setQuiz(receivedQuiz);
    };

    const handleUsedQuestions = (
      questionIds: string[]
    ) => {
      setUsedQuestionIds(questionIds);
    };

    const handleQuestionSelected = (
      question: PublicQuestion
    ) => {
      console.log("Öffentliche Frage empfangen:", question.id);

      setCurrentPublicQuestion(question);
      setPointValue(question.points);
      setTeamTextsRevealed(false);
      
    };

    const handleQuestionSelectedGM = (
      question: Question
    ) => {
      console.log("Vollständige GM-Frage empfangen:", question.id);

      setCurrentQuestion(question);
      setPointValue(question.points);
      setRevealedAnswer(null);
      setBuzzerWinner(null);
      setTeamText("");
      setSubmittedTeamTexts([]);
      setTeamTextsRevealed(false);
    };

    const handleBuzzAccepted = (
      winner: BuzzerWinner
    ) => {
      setBuzzerWinner(winner);
    };

    const handleBuzzerReset = () => {
      setBuzzerWinner(null);
    };

    const handleTeamTextChanged = (
      text: string
    ) => {
      setTeamText(text);
    };

    const handleTeamTextsRevealed = () => {
      setTeamTextsRevealed(true);
    };

    const handleTeamTextSubmitted = (
      name: string,
      text: string
    ) => {
      setSubmittedTeamTexts(
        (currentTexts) => {
          const otherAnswers =
            currentTexts.filter(
              (answer) =>
                answer.name !== name
            );

          return [
            ...otherAnswers,
            {
              name,
              text,
            },
          ];
        }
      );
    };
    

    socket.on("connect", handleConnect);

    socket.on("joined", handleJoined);

    socket.on("joinedAdmin", handleJoinedAdmin);

    socket.on("players", handlePlayers);

    socket.on("phaseChanged", handlePhaseChange);

    socket.on("quiz", handleQuiz);

    socket.on("usedQuestionsChanged", handleUsedQuestions);

    socket.on("questionSelected", handleQuestionSelected);

    socket.on("questionSelectedGM", handleQuestionSelectedGM);

    socket.on("answerRevealed", handleAnswerRevealed);

    socket.on("buzzAccepted", handleBuzzAccepted);

    socket.on("buzzerReset", handleBuzzerReset);

    socket.emit("requestQuiz");

    socket.on("teamTextChanged", handleTeamTextChanged);

    socket.on("teamTextSubmitted", handleTeamTextSubmitted);

    socket.on("teamTextsRevealed", handleTeamTextsRevealed);

    socket.on("nextTeam", handleNextTeam);

    socket.on("currentTeamChanged", handleCurrentTeamChanged);

    return () => {
      socket.off("connect", handleConnect);

      socket.off("joined", handleJoined);

      socket.off("joinedAdmin", handleJoinedAdmin);

      socket.off("players", handlePlayers);

      socket.off("phaseChanged", handlePhaseChange);

      socket.off("quiz", handleQuiz);

      socket.off("usedQuestionsChanged", handleUsedQuestions);

      socket.off("questionSelected", handleQuestionSelected);

      socket.off("questionSelectedGM", handleQuestionSelectedGM);

      socket.off("answerRevealed", handleAnswerRevealed);

      socket.off("buzzAccepted", handleBuzzAccepted);

      socket.off("buzzerReset", handleBuzzerReset);

      socket.off("teamTextChanged", handleTeamTextChanged);

      socket.off("teamTextSubmitted", handleTeamTextSubmitted);

      socket.off("teamTextsRevealed", handleTeamTextsRevealed);

      socket.off("nextTeam", handleNextTeam);

      socket.off("currentTeamChanged", handleCurrentTeamChanged);
    };
  }, []);

  const handleJoin = (name: string) => {
    socket.emit("join", name);
  };

  const handleBoardBroadcast = () => {
    setCurrentPublicQuestion(null);
    setCurrentQuestion(null);
    setRevealedAnswer(null);
    setBuzzerWinner(null);
    setTeamText("");
    setSubmittedTeamTexts([]);
    setTeamTextsRevealed(false);

    socket.emit("changePhase", "board");
  };

  const handleLobbyBroadcast = () => {
    setCurrentPublicQuestion(null);
    setCurrentQuestion(null);
    setRevealedAnswer(null);
    setBuzzerWinner(null);
    setTeamText("");
    setSubmittedTeamTexts([]);
    setTeamTextsRevealed(false);

    socket.emit("changePhase", "lobby");
  };

  const handleSelectQuestion = (
    questionId: string,
    points: number
  ) => {
    setPointValue(points);

    socket.emit("selectQuestion", questionId);
  };

  const changeTeam = (
    playerID: string,
    groupName: string,
    color: string
  ) => {
    socket.emit(
      "changeTeam",
      playerID,
      groupName,
      color
    );
  };

  const setGm = (playerID: string) => {
    socket.emit("setGm", playerID);
  };

  const handleRevealAnswer = () => {
    socket.emit("revealAnswer");
  };

  const handleBuzz = () => {
    socket.emit("buzz");
  };

  const handleResetBuzzer = () => {
    socket.emit("resetBuzzer");
  };

  const handleTeamTextChange = (text: string) => {
    const currentPlayer = players.find((player) => player.id === socket.id);

    if (!currentPlayer) {return;}

    setTeamText(text);

    socket.emit("updateTeamText", currentPlayer, text);
  };

  const handleSubmitTeamText = () => {const currentPlayer = players.find((player) => player.id === socket.id);
    if (!currentPlayer) {return;}

    socket.emit("submitTeamText", currentPlayer,teamText);
  };

  const handleNextTeam = () => {
    socket.emit("nextTeam");
  };

  const handleRevealTeamTexts = () => {
    socket.emit("revealTeamTexts");
  };

  const handleCurrentTeamChanged = (
    team: string | null
  ) => {
    setCurrentTeam(team);
  };

  
  return (
    <main id="app">
        <canvas id="make-me-cool" ref={canvasRef} />
      <div className="app-content">
      <h1 id="quiz-title">Katzencafé-Quiz</h1>

      
      {phase === "start" && (
        <JoinScreen onJoin={handleJoin} />
      )}

      {phase === "lobby" &&
        (isGameMaster ? (
          <Lobbygm
            players={players}
            onChangeTeam={changeTeam}
            setGm={setGm}
          />
        ) : (
          <Lobby />
        ))}

      {phase === "board" &&
        (quiz ? (
          isGameMaster ? (
            <Boardgm
              quiz={quiz}
              usedQuestionIds={usedQuestionIds}
              onSelectQuestion={handleSelectQuestion}
            />
          ) : (
            <Board
              quiz={quiz}
              usedQuestionIds={usedQuestionIds}
            />
          )
        ) : (
          <section>
            <p>Quiz wird geladen...</p>
          </section>
        ))}

      {phase === "frage" &&
        (isGameMaster ? (
          currentQuestion ? (
            <Fragengm
              question={currentQuestion}
              onRevealAnswer={handleRevealAnswer}
              buzzerWinner={buzzerWinner}
              onResetBuzzer={handleResetBuzzer}
              submittedTeamTexts={submittedTeamTexts}
              onRevealTeamTexts={handleRevealTeamTexts}

              
            />
          ) : (
            <section>
              <p>
                GM-Frage wird geladen...
              </p>
            </section>
          )
        ) : currentPublicQuestion ? (
          <Fragen
            question={currentPublicQuestion}
            revealedAnswer={revealedAnswer}
            buzzerWinner={buzzerWinner}
            onBuzz={handleBuzz}
            teamText={teamText}
            onTeamTextChange={handleTeamTextChange}
            onSubmitTeamText={handleSubmitTeamText}
            submittedTeamTexts={submittedTeamTexts}
            teamTextsRevealed={teamTextsRevealed}
          />
        ) : (
          <section>
            <p>Frage wird geladen...</p>
          </section>
        ))}

      {phase !== "start" &&
        (isGameMaster ? (
          <Scoreboardgm
            players={players}
            pointValue={pointValue}
            setPointValue={setPointValue}
            onBoard={handleBoardBroadcast}
            onLobby={handleLobbyBroadcast}
            onNextTeam={handleNextTeam}
            currentTeam={currentTeam}
          />
        ) : (
          <Scoreboard 
            players={players}
            currentTeam={currentTeam}
            />
        ))}
      </div>
    </main>
  );
}

export default App;