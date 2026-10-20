import { useEffect, useState, useRef } from "react";
import "./App.css";

import type { Player } from "./types/Player";
import type {
  PublicQuestion,
  PublicQuizData,
  Question,
  RevealedAnswer,
  BuzzerWinner,
  QuestionExtra,
  AudioState,
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
import CameraPreview from "./components/CameraPreview";

import { socket, serverUrl } from "./socket";

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

  const audioRef = useRef<HTMLAudioElement>(null);

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
  
  const [currentTeam, setCurrentTeam] = useState<string | null>(null);

  const [audioState, setAudioState] = useState<AudioState | null>(null);

  const [audioBlocked, setAudioBlocked] = useState(false);

  const [volume, setVolume] = useState(100);

  const [cookies, setCookies] = useState(0);

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
        setAudioState(null);
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
      setAudioState(null);
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
    
    const handlePicturesRevealed = ({
      questionId,
      extras,
    }: {
      questionId: string;
      extras: QuestionExtra[];
    }) => {
      setCurrentPublicQuestion((current) => {
        if (!current || current.id !== questionId) {
          return current;
        }

        return {
          ...current,
          extras: [
            ...current.extras.filter(
              (extra) => extra.type !== "picturescroll"
            ),
            ...extras,
          ],
        };
      });
    };

    const handleAudioStateChanged = (state: AudioState) => {
      setAudioState(state);
    };

    const handleCookiesChanged = (count: number) => {
      setCookies(count);
    };

    socket.on("connect", handleConnect);

    socket.on("cookiesChanged", handleCookiesChanged);

    socket.on("audioStateChanged", handleAudioStateChanged);

    socket.on("picturesRevealed", handlePicturesRevealed);  

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

      socket.off("cookiesChanged", handleCookiesChanged);

      socket.off("audioStateChanged", handleAudioStateChanged);

      socket.off("picturesRevealed", handlePicturesRevealed);

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

  const handleRevealNextPicture = () => {
    socket.emit("revealNextPicture");
  };

  const handlePlayAudio = (extraIndex: number) => {
    if (!currentQuestion) {
      return;
    }

    socket.emit("playAudio", {
      questionId: currentQuestion.id,
      extraIndex,
    });
  };

  const handlePauseAudio = () => {
    if (!currentQuestion) {
      return;
    }

    socket.emit("pauseAudio", currentQuestion.id);
  };

  const handleResetAudio = () => {
    if (!currentQuestion) {
      return;
    }

    socket.emit("resetAudio", currentQuestion.id);
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

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    // Beim Verlassen oder Wechseln der Frage Audio entfernen.
    if (!audioState) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setAudioBlocked(false);
      return;
    }

    let cancelled = false;
    const receivedAt = performance.now();

    const source = new URL(
      audioState.url,
      serverUrl
    ).href;

    const applyAudioState = () => {
      if (cancelled) {
        return;
      }

      let position = audioState.positionSeconds;

      if (
        audioState.isPlaying &&
        audioState.startedAt !== null
      ) {
        // Bereits auf dem Server vergangene Wiedergabezeit.
        position += Math.max(
          0,
          audioState.serverNow - audioState.startedAt
        ) / 1000;

        // Ladezeit auf diesem Gerät berücksichtigen.
        position += (performance.now() - receivedAt) / 1000;
      }

      const duration = audio.duration;

      if (Number.isFinite(duration)) {
        position = Math.min(position, duration);
      }

      audio.currentTime = Math.max(0, position);

      if (
        !audioState.isPlaying ||
        (Number.isFinite(duration) && position >= duration)
      ) {
        audio.pause();
        setAudioBlocked(false);
        return;
      }

      audio.play()
        .then(() => {
          if (!cancelled) {
            setAudioBlocked(false);
          }
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }

          if (
            error instanceof DOMException &&
            error.name === "NotAllowedError"
          ) {
            setAudioBlocked(true);
          } else {
            console.error("Audio konnte nicht starten:", error);
          }
        });
    };

    audio.pause();
    setAudioBlocked(false);

    audio.addEventListener(
      "loadedmetadata",
      applyAudioState
    );

    if (audio.src !== source) {
      audio.src = source;
      audio.load();
    } else if (audio.readyState >= 1) {
      applyAudioState();
    }

    return () => {
      cancelled = true;

      audio.removeEventListener(
        "loadedmetadata",
        applyAudioState
      );

      audio.pause();
    };
  }, [audioState]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  return (
    <main id="app">
        <canvas id="make-me-cool" ref={canvasRef} />
        <audio ref={audioRef} preload="metadata" />
        {/* Design nach Uiverse.io / Galahhad */}
        {phase === "frage" && (
          <label
            className="quiz-volume-slider"
            title={`Lautstärke: ${volume}%`}
          >
            <input
              className="quiz-volume-level"
              type="range"
              min="0"
              max="100"
              step="1"
              value={volume}
              aria-label="Lautstärke auf diesem Gerät"
              aria-valuetext={`${volume} Prozent`}
              onChange={(event) =>
                setVolume(Number(event.target.value))
              }
              style={{
                background: `linear-gradient(
                  to right,
                  #ff9500 0%,
                  #ff9500 ${volume}%,
                  #66513d ${volume}%,
                  #66513d 100%
                )`,
              }}
            />

            <svg
              className="quiz-volume-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M18.36 19.36a1 1 0 0 1-.705-1.71C19.167 16.148 20 14.142 20 12s-.833-4.148-2.345-5.65a1 1 0 1 1 1.41-1.419C20.958 6.812 22 9.322 22 12s-1.042 5.188-2.935 7.069a.997.997 0 0 1-.705.291z"
                fill="currentColor"
              />
              <path
                d="M15.53 16.53a.999.999 0 0 1-.703-1.711C15.572 14.082 16 13.054 16 12s-.428-2.082-1.173-2.819a1 1 0 1 1 1.406-1.422A6 6 0 0 1 18 12a6 6 0 0 1-1.767 4.241.996.996 0 0 1-.703.289zM12 22a1 1 0 0 1-.707-.293L6.586 17H4c-1.103 0-2-.897-2-2V9c0-1.103.897-2 2-2h2.586l4.707-4.707A.998.998 0 0 1 13 3v18a1 1 0 0 1-1 1z"
                fill="currentColor"
              />
            </svg>
          </label>
        )}
        {audioBlocked && audioState?.isPlaying && (
        <button
          type="button"
          style={{
            position: "fixed",
            top: "16px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 11000,
            padding: "14px 24px",
            border: "1px solid #ff9500",
            borderRadius: "12px",
            background: "#332416",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
          onClick={() => {
            const audio = audioRef.current;

            if (!audio) {
              return;
            }

            audio.play()
              .then(() => setAudioBlocked(false))
              .catch((error: unknown) => {
                console.error(
                  "Audio konnte nicht aktiviert werden:",
                  error
                );
              });
          }}
        >
          Audio auf diesem Gerät aktivieren
        </button>
      )}
      <div className="app-content">
      <h1 id="quiz-title">Katzencafé-Quiz</h1>
      <div className="game-area">
      <CameraPreview />
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
              revealedAnswer={revealedAnswer}
              onRevealAnswer={handleRevealAnswer}
              onRevealNextPicture={handleRevealNextPicture}
              buzzerWinner={buzzerWinner}
              onResetBuzzer={handleResetBuzzer}
              submittedTeamTexts={submittedTeamTexts}
              onRevealTeamTexts={handleRevealTeamTexts}
              revealedScrollPictures={
                currentPublicQuestion?.id === currentQuestion.id
                  ? currentPublicQuestion.extras.filter(
                      (extra) => extra.type === "picturescroll"
                    )
                  : []
              }
              onPlayAudio={handlePlayAudio}
              onPauseAudio={handlePauseAudio}
              onResetAudio={handleResetAudio}
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

      </div>
      <button className="btn-class-name" onClick={() => socket.emit("clickCookie")} style={{ "position": "fixed" } as React.CSSProperties}>
        <span className="back"></span>
        <span className="front"></span>
      </button>
      <div
        className={`cookie-counter ${
          cookies === 67 ? "cookie-event-67" : ""
        }`}
      >
        {cookies.toLocaleString("de-DE")}
      </div>
      <div className="scoreboard-area">
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
      </div>
    </main>
  );
}

export default App;