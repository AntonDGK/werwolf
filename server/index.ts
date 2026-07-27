import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

import type { Player } from "./types/Player";

import {
  getPublicQuiz,
  getQuestionById,
} from "./quizLoader";

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

app.get("/", (req, res) => {res.send("Server!");});

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
      gameState.currentTeam = null;
      gameState.buzzerPlayerId = null;

      io.emit("usedQuestionsChanged", Array.from(gameState.usedQuestionIds));

      console.log("Board wurde zurückgesetzt.");
    });

    socket.on("changePhase", (newPhase: GamePhase) => {
        const gameMaster =
          players.find(
            (player) =>
              player.id ===
              socket.id
          );

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

        io.emit("phaseChanged", currentPhase);
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
          extras: question.extras,
        });

        console.log(`Frage ${questionId} wurde ausgewählt.`);
        socket.emit("questionSelectedGM", question);
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

      io.emit("answerRevealed", {
        questionId: question.id,
        answer: question.answer,
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

        if (
          player.isGameMaster
        ) {
          console.log("Der GameMaster kann keinem Team zugewiesen werden.");
          return;
        }

        player.group = groupName;

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
        if(p.group == player.group){
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

    socket.on("disconnect", () => {const index = players.findIndex((player) => player.id === socket.id);

        if (index === -1) {return;}

        const wasGameMaster = players[index].isGameMaster;

        players.splice(index, 1);

        if (wasGameMaster &&  players.length > 0) {
          const newGameMaster = players[0];

          newGameMaster.isGameMaster = true;

          io.to(newGameMaster.id).emit("joinedAdmin");

          io.to(newGameMaster.id).emit("phaseChanged", currentPhase);
        }

        console.log(`${socket.id} hat die Verbindung getrennt.`);

        io.emit("players", players);
      }
    );
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