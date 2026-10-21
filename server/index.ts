import express from "express";
import { createHash, timingSafeEqual } from "crypto";
import { createServer } from "http";
import { Server } from "socket.io";

import type { Player } from "./types/Player";
import type { GamePhase, UserRole } from "./types/Types";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL?.trim() || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

const players: Player[] = [];

// TODO: Später durch eine richtige Spielsteuerung ersetzen.
const currentPhase: GamePhase = "lobby";

// Öffentliche Spielerliste: geheime Werwolf-Rollen werden NICHT gesendet.
function broadcastPlayers(): void {
  const publicPlayers = players.map((player) => ({
    id: player.id,
    name: player.name,
    userRole: player.userRole,
    color: player.color,
  }));

  io.emit("players", publicPlayers);
}

app.get("/", (_req, res) => {
  res.send("Werwolf Engine Server läuft 🐺");
});

io.on("connection", (socket) => {
  console.log("Client verbunden:", socket.id);

  // TODO: Test-Beitritt durch Passwort, Einladungscode und
  // ausdrückliche Freigabe des Gamemasters ersetzen.
  // ACHTUNG: Aktuell ist die Lobby NICHT zugangsgeschützt.
  // GAMEMASTER-LOGIN
// TODO: Später zusätzliche IP-basierte Rate-Limits ergänzen.

  let failedAdminAttempts = 0;

  socket.on("admin:login", (password: unknown) => {
    const adminPassword = process.env.ADMIN_PASSWORD;

    // Ohne konfiguriertes Passwort gibt es keinen Adminzugang.
    if (!adminPassword || adminPassword.length < 16) {
      socket.emit("auth:error", "Adminzugang nicht konfiguriert.");
      return;
    }

    // Einfache Begrenzung pro Socket-Verbindung.
    if (failedAdminAttempts >= 5) {
      socket.emit("auth:error", "Zu viele Fehlversuche.");
      return;
    }

    if (typeof password !== "string" || password.length > 256) {
      failedAdminAttempts++;
      socket.emit("auth:error", "Anmeldung fehlgeschlagen.");
      return;
    }

    const expected = createHash("sha256")
      .update(adminPassword)
      .digest();

    const received = createHash("sha256")
      .update(password)
      .digest();

    if (!timingSafeEqual(expected, received)) {
      failedAdminAttempts++;
      socket.emit("auth:error", "Anmeldung fehlgeschlagen.");
      return;
    }

    // Keine zweite Identität über denselben Socket.
    if (players.some((player) => player.id === socket.id)) {
      socket.emit("auth:error", "Bereits angemeldet.");
      return;
    }

    // Vorerst nur ein aktiver Gamemaster.
    if (players.some((player) => player.userRole === "gamemaster")) {
      socket.emit("auth:error", "Gamemaster bereits angemeldet.");
      return;
    }

    const admin: Player = {
      id: socket.id,
      name: "Gamemaster",
      userRole: "gamemaster",
      gameRole: null,
      isAlive: true,
      color: null,
    };

    players.push(admin);

    socket.emit("joinedAdmin");
    socket.emit("phaseChanged", currentPhase);

    broadcastPlayers();

    console.log("Gamemaster erfolgreich angemeldet.");
  });
  socket.on("join", (input: unknown) => {
    if (typeof input !== "string") return;

    const name = input.trim().slice(0, 30);
    if (!name) return;

    // Pro Socket nur ein Spieler.
    if (players.some((player) => player.id === socket.id)) return;


    const userRole: UserRole = "player";

    const newPlayer: Player = {
      id: socket.id,
      name,
      userRole,
      gameRole: null,
      isAlive: true,
      color: null,
    };

    players.push(newPlayer);

    socket.emit(userRole === "gamemaster" ? "joinedAdmin" : "joined");
    socket.emit("phaseChanged", currentPhase);
    broadcastPlayers();

    console.log(`${name} ist beigetreten (${userRole}).`);
  });

  // Nur WebRTC-Verbindungsinformationen vermitteln.
  // Kameravideos werden NICHT über Socket.IO übertragen.
  // Der Client verlangt vor einer Übertragung eine eigene Bestätigung.
  socket.on("webrtc:signal", (data: unknown) => {
    if (!data || typeof data !== "object") return;

    const { targetId, signal } = data as {
      targetId?: unknown;
      signal?: unknown;
    };

    if (typeof targetId !== "string" || targetId === socket.id) return;
    if (!signal || typeof signal !== "object") return;

    // Nur Spieler, die der Test-Lobby beigetreten sind.
    const senderExists = players.some((player) => player.id === socket.id);
    const receiverExists = players.some((player) => player.id === targetId);
    if (!senderExists || !receiverExists) return;

    const { type, sessionId } = signal as {
      type?: unknown;
      sessionId?: unknown;
    };

    if (
      typeof type !== "string" ||
      !["offer", "answer", "ice", "stop"].includes(type) ||
      typeof sessionId !== "string" ||
      sessionId.length === 0 ||
      sessionId.length > 128
    ) {
      return;
    }

    io.to(targetId).emit("webrtc:signal", {
      senderId: socket.id,
      signal,
    });
  });

  socket.on("disconnect", () => {
    const index = players.findIndex((player) => player.id === socket.id);
    if (index === -1) return;

    const [leavingPlayer] = players.splice(index, 1);
    console.log("Client getrennt:", leavingPlayer.name);

    broadcastPlayers();
  });
});

const PORT = Number(process.env.PORT) || 3000;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Werwolf Engine Server läuft auf Port ${PORT}`);
});
