import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

import type { Player } from "./types/Player";

import fs from "fs";
import path from "path";

import {
  getPublicQuiz,
  getQuestionById,
} from "./quizLoader";

import type {
  Question,
  QuestionExtra,
} from "./types/Quiz";

import { gameState } from "./gameState";

type GamePhase =
  | "lobby"
  | "board"
  | "frage";

const app = express();

const httpServer =
  createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin:
      process.env.CLIENT_URL ??
      "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

const players: Player[] = [];

let currentPhase: GamePhase = "lobby";

function getTeamKey(player: Player): string {
  return player.group !== null
    ? `group:${player.group}`
    : `player:${player.id}`;
}

function getTeamKeys(): string[] {
  return [
    ...new Set(
      players
        .filter((player) => !player.isGameMaster)
        .map(getTeamKey)
    ),
  ];
}

app.get("/", (req, res) => {res.send("Server! von AntonDGK lowkey bisschen sus das du hier bist geh mal bitte wieder");});

const quizMediaDirectory = path.resolve(
  __dirname,
  "../quizfragen"
);

app.get("/media/:questionId/:extraIndex", (req, res) => {
  const { questionId, extraIndex } = req.params;

  // Nur Medien der aktuell geöffneten Frage ausliefern.
  if (
    currentPhase !== "frage" ||
    gameState.currentQuestionId !== questionId
  ) {
    res.sendStatus(403);
    return;
  }

  const question = getQuestionById(questionId);

  if (!question || !/^\d+$/.test(extraIndex)) {
    res.sendStatus(404);
    return;
  }

  const extra = question.extras[Number(extraIndex)];

  if (!extra) {
    res.sendStatus(404);
    return;
  }

  const isVisible =
    extra.type === "picture" ||
    (
      extra.type === "revealpicture" &&
      gameState.answerRevealed
    );

  if (!isVisible) {
    res.sendStatus(403);
    return;
  }

  // Vorerst liegen Bilder direkt neben questions.json.
  // Unterordner und Pfade außerhalb dieses Ordners sind ausgeschlossen.
  if (
    typeof extra.file !== "string" ||
    extra.file.includes("/") ||
    extra.file.includes("\\")
  ) {
    res.sendStatus(400);
    return;
  }

  const allowedExtensions = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".avif",
  ]);

  const extension = path.extname(extra.file).toLowerCase();

  if (!allowedExtensions.has(extension)) {
    res.sendStatus(415);
    return;
  }

  try {
    const realDirectory = fs.realpathSync(quizMediaDirectory);
    const realFile = fs.realpathSync(
      path.join(realDirectory, extra.file)
    );

    // Auch Verknüpfungen dürfen nicht aus dem Quizordner führen.
    if (
      path.dirname(realFile) !== realDirectory ||
      !fs.statSync(realFile).isFile()
    ) {
      res.sendStatus(403);
      return;
    }

    res.setHeader("Cache-Control", "no-store");

    res.sendFile(realFile, (error) => {
      if (error && !res.headersSent) {
        res.sendStatus(500);
      }
    });
  } catch {
    res.sendStatus(404);
  }
});

function getExtrasWithUrls(
  question: Question
): QuestionExtra[] {
  return question.extras.map((extra, index) => ({
    ...extra,
    url: `/media/${encodeURIComponent(question.id)}/${index}`,
  }));
}

io.on("connection", (socket) => {socket.emit("quiz", getPublicQuiz());

    socket.emit("usedQuestionsChanged", Array.from(gameState.usedQuestionIds));

    socket.on("requestQuiz", () => {socket.emit("quiz", getPublicQuiz());
        socket.emit("usedQuestionsChanged", Array.from(gameState.usedQuestionIds));
      }
    );

    console.log("Neuer Client verbunden:", socket.id);

    socket.on("join", (name: string) => {const cleanName = name?.trim();

      if (!cleanName) {
        console.log("Ungültiger Name");
        return;
      }

      const existingPlayer =
        players.find(
          (player) =>
            player.id ===
            socket.id
        );

      if (existingPlayer) {
        return;
      }

      const isFirstPlayer =
        players.length === 0;

      if(isFirstPlayer) {
        currentPhase = "lobby";
      }

      const newPlayer: Player = {
        id: socket.id,
        name: cleanName,
        points: 0,
        group: null,
        isGameMaster:
          isFirstPlayer,
        color: null,
      };

      players.push(newPlayer);

      if (newPlayer.isGameMaster) {
        socket.emit("joinedAdmin");
      } else {
        socket.emit("joined");
      }

      socket.emit("phaseChanged", currentPhase);

      // Aktuelle Frage an den neuen Spieler senden.
      if (
        currentPhase === "frage" &&
        gameState.currentQuestionId
      ) {
        const question = getQuestionById(
          gameState.currentQuestionId
        );

        if (question) {
          socket.emit("questionSelected", {
            id: question.id,
            points: question.points,
            type: question.type,
            question: question.question,
            extras: getExtrasWithUrls(question).filter(
              (extra) => extra.type === "picture"
            ),
          });

          // NEU: Bereits freigegebene Auflösung nachliefern.
          if (gameState.answerRevealed) {
            socket.emit("answerRevealed", {
              questionId: question.id,
              answer: question.answer,
              extras: getExtrasWithUrls(question).filter(
                (extra) => extra.type === "revealpicture"
              ),
            });
          }

          if (newPlayer.isGameMaster) {
            socket.emit("questionSelectedGM", {
              ...question,
              extras: getExtrasWithUrls(question),
            });
          }

          // Bereits vergebenen Buzzer übertragen.
          const buzzerWinner = players.find(
            (player) =>
              player.id === gameState.buzzerPlayerId
          );

          if (buzzerWinner) {
            socket.emit("buzzAccepted", {
              playerId: buzzerWinner.id,
              playerName: buzzerWinner.name,
              groupName: buzzerWinner.group,
            });
          }
        }
      }

      // Aktuelles Team übertragen.
      socket.emit(
        "currentTeamChanged",
        gameState.currentTeam
      );

      io.emit("players", players);

      console.log("Aktuelle Spieler:");

      console.log(players);
      }
    );

    socket.on("resetBoard", () => {
      const gameMaster = players.find((player) => player.id === socket.id);

      if (!gameMaster?.isGameMaster) {
        console.log("Nur der GameMaster darf das Board zurücksetzen.");
        return;
      }

      gameState.usedQuestionIds.clear();
      gameState.currentQuestionId = null;
      gameState.answerRevealed = false;
      gameState.currentTeam = null;
      gameState.buzzerPlayerId = null;

      io.emit("usedQuestionsChanged", Array.from(gameState.usedQuestionIds));

      console.log("Board wurde zurückgesetzt.");
    });

    socket.on("changePhase", (newPhase: GamePhase) => {
        const gameMaster =
          players.find((player) => player.id === socket.id);

        if (!gameMaster ?.isGameMaster) {
          console.log("Nur der GameMaster darf die Phase ändern.");
          return;
        }

        
        const allowedPhases:
          GamePhase[] = [
          "lobby",
          "board",
          "frage",
        ];

        if (!allowedPhases.includes(newPhase)) {
          console.log("Ungültige Spielphase:", newPhase);
          return;
        }

        currentPhase = newPhase;

        console.log("Spielphase geändert zu:", currentPhase);

        for (const player of players) {
          io.to(player.id).emit("phaseChanged", currentPhase);
        }
      }
    );

    socket.on("selectQuestion",
      (questionId: string) => {
        const gameMaster = players.find((player) => player.id === socket.id);

        if (!gameMaster?.isGameMaster) {
          console.log("Nur der GameMaster darf eine Frage auswählen.");
          return;
        }

        const question = getQuestionById(questionId);

        if (!question) {
          console.log("Frage wurde nicht gefunden:", questionId);
          return;
        }

        if (gameState.usedQuestionIds.has(questionId)) {
          console.log("Diese Frage wurde bereits gespielt:", questionId);
          return;
        }

        gameState.currentQuestionId = questionId;

        gameState.answerRevealed = false;

        gameState.usedQuestionIds.add(questionId);

        currentPhase = "frage";

        gameState.buzzerPlayerId = null;

        io.emit("buzzerReset");

        io.emit("usedQuestionsChanged", Array.from(gameState.usedQuestionIds));

        io.emit("phaseChanged", currentPhase);

        io.emit("questionSelected", {
          id: question.id,
          points: question.points,
          type: question.type,
          question: question.question,
        extras: getExtrasWithUrls(question).filter(
          (extra) => extra.type === "picture")
        });

        console.log(`Frage ${questionId} wurde ausgewählt.`);
        socket.emit("questionSelectedGM", {
          ...question,
          extras: getExtrasWithUrls(question),
        });
      }
    );

    socket.on("buzz", () => {
      if (!gameState.currentQuestionId) {return;}

      const question = getQuestionById(gameState.currentQuestionId);

      if (!question) {return;}

      if (question.type !== "buzzer") {return;}

      if (gameState.buzzerPlayerId) {return;}

      const player = players.find((player) => player.id === socket.id);

      if (!player) {return;}

      if (player.isGameMaster) {return;}

      gameState.buzzerPlayerId = player.id;

      console.log("${player.name} hat gebuzzert.");

      io.emit("buzzAccepted", {
        playerId: player.id,
        playerName: player.name,
        groupName: player.group,
      });
    });

    socket.on("resetBuzzer", () => {const player = players.find((player) => player.id === socket.id);

      if (!player?.isGameMaster) {
        console.log("Nur der GameMaster darf die Buzzer resetten.");
        return;
      }

      gameState.buzzerPlayerId = null;

      io.emit("buzzerReset");
    });

    socket.on("revealAnswer", () => {
      const gameMaster = players.find(
        (player) =>
          player.id === socket.id
      );

      if (!gameMaster?.isGameMaster) {
        console.log("Nur der GameMaster darf die Antwort anzeigen.");
        return;
      }

      if (!gameState.currentQuestionId) {
        console.log("Aktuell ist keine Frage ausgewählt.");
        return;
      }

      const question = getQuestionById(gameState.currentQuestionId);

      if (!question) {
        console.log("Die aktuelle Frage wurde nicht gefunden.");
        return;
      }

      gameState.answerRevealed = true;

      io.emit("answerRevealed", {
        questionId: question.id,
        answer: question.answer,
        extras: getExtrasWithUrls(question).filter(
          (extra) => extra.type === "revealpicture"
        ),
      });
    });

    socket.on("changeTeam",
      ( playerId: string,
        groupName: string,
        color: string
      ) => {
        const gameMaster =
          players.find(
            (player) =>
              player.id ===
              socket.id
          );

        if (!gameMaster ?.isGameMaster) {
          console.log("Nur der GameMaster darf Teams ändern.");
          return;
        }

        const player = players.find((currentPlayer) => currentPlayer.id === playerId);

        if (!player) {
          console.log("Spieler wurde nicht gefunden.");
          return;
        }

        if (player.isGameMaster) {
          console.log("Der GameMaster kann keinem Team zugewiesen werden.");
          return;
          
        }

        if (groupName == "") {
          player.group = null;
        } else {
          player.group = groupName;
        }
        player.color = color;

        console.log(`${player.name} ist jetzt in ${groupName} mit der Farbe ${color}.`);

        io.emit("players", players);
      }
    );

    socket.on("setGm", (playerId: string) => {const gameMaster = players.find((player) => player.id === socket.id);

        if (!gameMaster ?.isGameMaster) {
          console.log("Nur der GameMaster darf GameMaster abgeben.");
          return;
        }

        const player = players.find((currentPlayer) => currentPlayer.id === playerId);

        if (!player) {
          console.log("Spieler wurde nicht gefunden.");
          return;
        }

        if (player.id === gameMaster.id) {
          return;
        }

        gameMaster.isGameMaster = false;

        player.isGameMaster = true;

        io.to(gameMaster.id).emit("joined");

        io.to(player.id).emit("joinedAdmin");

        currentPhase = "lobby";

        io.emit("phaseChanged", currentPhase);

        console.log(`${player.name} ist jetzt GameMaster.`);

        io.emit("players", players);
      }
    );

    socket.on("addPointsToPlayer", ({
        playerId,
        points,
      }: {
        playerId: string;
        points: number;
      }) => {
        const gameMaster =
          players.find(
            (player) =>
              player.id ===
              socket.id
          );

        if (!gameMaster ?.isGameMaster) {
          console.log("Nur der GameMaster darf Punkte ändern.");
          return;
        }

        if (!Number.isFinite(points)) {return;}

        const player =players.find((currentPlayer) => currentPlayer.id === playerId);

        if (!player) {return;}

        player.points += points;

        console.log(`${player.name} erhält ${points} Punkte.`);

        io.emit("players", players);
      }
    );

    socket.on("addPointsToGroup", ({
        groupName,
        points,
      }: {
        groupName: string;
        points: number;
      }) => {
        const gameMaster =
          players.find(
            (player) =>
              player.id ===
              socket.id
          );

        if (!gameMaster ?.isGameMaster) {
          console.log("Nur der GameMaster darf Punkte ändern.");
          return;
        }

        if (!Number.isFinite(points)) {return;}

        const groupPlayers = players.filter((player) => player.group === groupName);

        if (groupPlayers.length === 0) {return;}

        groupPlayers.forEach((player) => {player.points += points;});

        console.log(`Gruppe ${groupName} erhält ${points} Punkte.`);

        io.emit("players", players);
      }
    );

    socket.on("updateTeamText", (player: Player, text: string) => {
      if(player.group == null) {
        //socket.emit("teamTextChanged", text);
        return;
      }
      for (const p of players) {
        if(p.group == player.group && p.id !== player.id){
          io.to(p.id).emit("teamTextChanged", text);
        }
      }
      }
    );

    socket.on("submitTeamText", (player: Player, text: string) => {
        const name = player.group ?? player.name;

        io.emit("teamTextSubmitted", name, text);
      }
    );

    socket.on("revealTeamTexts", () => {
      io.emit("teamTextsRevealed");
    });

    socket.on("nextTeam", () => {
      const gameMaster = players.find(
        (player) => player.id === socket.id
      );

      if (!gameMaster?.isGameMaster) {return;}

      const teams = getTeamKeys();

      if (teams.length === 0) {
        gameState.currentTeam = null;
        io.emit("currentTeamChanged", null);
        return;
      }

      const currentIndex = teams.indexOf(
        gameState.currentTeam ?? ""
      );

      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % teams.length;

      gameState.currentTeam = teams[nextIndex];

      io.emit("currentTeamChanged", gameState.currentTeam);
    });

    socket.on("disconnect", () => {
      const index = players.findIndex((player) => player.id === socket.id);

      if (index === -1) {return;}

      const disconnectedPlayer = players[index];
      const wasGameMaster = disconnectedPlayer.isGameMaster;

      const disconnectedTeamKey = getTeamKey(disconnectedPlayer);

      const wasCurrentTeam = gameState.currentTeam === disconnectedTeamKey;

      players.splice(index, 1);

      if (
        wasGameMaster &&
        players.length > 0
      ) {
        const newGameMaster = players[0];

        newGameMaster.isGameMaster = true;

        io.to(newGameMaster.id).emit("joinedAdmin");

        io.to(newGameMaster.id).emit("phaseChanged", currentPhase);
      }

      const teams = getTeamKeys();

      if (teams.length === 0) {
        gameState.currentTeam = null;

        io.emit("currentTeamChanged", null);
      } else if (gameState.currentTeam === null || (wasCurrentTeam && !teams.includes(disconnectedTeamKey)) || !teams.includes(gameState.currentTeam)) {
        gameState.currentTeam = teams[0];

        io.emit("currentTeamChanged", gameState.currentTeam);
      }

      console.log(`${socket.id} hat die Verbindung getrennt.`);

      io.emit("players", players);
      console.log("Aktuelle Spieler:" + players.map((p) => p.name).join(", "));
    });
  }
);

httpServer.listen(
  3000,
  () => {
    console.log(
      "Server läuft auf Port 3000"
    );
  }
);