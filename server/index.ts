
import express from "express";
import {createHash, timingSafeEqual, randomBytes, scryptSync} from "crypto";
import { createServer } from "http";
import { Server } from "socket.io";

import type { Player } from "./types/Player";
import type { GamePhase, UserRole } from "./types/Types";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin:
      process.env.CLIENT_URL?.trim() ||
      "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

const players: Player[] = [];

type PlayerAccount = {
  name: string;
  passwordHash: string;
  salt: string;
};

const playerAccounts = new Map<string, PlayerAccount>();


// TODO: Später durch die richtige Werwolf-Spielsteuerung ersetzen.
const currentPhase: GamePhase = "lobby";

// Öffentliche Spielerliste ohne geheime Werwolf-Rollen.
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

  // =====================================================
  // GAMEMASTER-LOGIN
  // =====================================================

  // TODO: Später zusätzlich IP-basierte Rate-Limits,
  // dauerhafte Sitzungen und sichere Account-Verwaltung.
  let failedAdminAttempts = 0;

  socket.on("admin:login", (password: unknown) => {
    const adminPassword = process.env.ADMIN_PASSWORD;

    // Ohne gültige Konfiguration keinen Adminzugang erlauben.
    if (!adminPassword || adminPassword.length < 16) {
      socket.emit(
        "auth:error",
        "Adminzugang nicht konfiguriert."
      );
      return;
    }

    // Vorläufige Begrenzung pro Socket-Verbindung.
    if (failedAdminAttempts >= 5) {
      socket.emit("auth:error", "Zu viele Fehlversuche.");
      return;
    }

    if (
      typeof password !== "string" ||
      password.length > 256
    ) {
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

    // Ein Socket darf nur eine Identität besitzen.
    if (players.some((player) => player.id === socket.id)) {
      socket.emit("auth:error", "Bereits angemeldet.");
      return;
    }

    // Vorerst nur ein aktiver Gamemaster.
    if (
      players.some(
        (player) => player.userRole === "gamemaster"
      )
    ) {
      socket.emit(
        "auth:error",
        "Gamemaster bereits angemeldet."
      );
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

  // =====================================================
  // SPIELER-BEITRITT
  // =====================================================

  // TODO: Hier individuelle Spielerpasswörter einbauen.
  // TODO: Spieler zunächst in einen Warteraum schicken.
  // TODO: Beitritt erst nach Gamemaster-Freigabe erlauben.
  //
  // ACHTUNG: Der Spielerbeitritt ist aktuell noch offen!

  socket.on("join", (input: unknown) => {
    if (typeof input !== "string") return;

    const name = input.trim().slice(0, 30);
    if (!name) return;

    // Pro Socket nur ein Spieler.
    if (
      players.some(
        (player) => player.id === socket.id
      )
    ) {
      return;
    }

    // Normale Spieler erhalten niemals automatisch
    // Gamemaster-Rechte.
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

    // KORRIGIERT:
    // Normale Spieler bekommen immer das Event "joined".
    socket.emit("joined");

    socket.emit("phaseChanged", currentPhase);

    broadcastPlayers();

    console.log(`${name} ist beigetreten (${userRole}).`);
  });

  // =====================================================
  // WEBRTC-SIGNALISIERUNG
  // =====================================================

  // Nur Verbindungsinformationen werden weitergeleitet.
  // Die Kamerabilder werden NICHT über Socket.IO übertragen.
  //
  // TODO: Später nur freigegebene Teilnehmer zulassen.
  // TODO: WebRTC-Zugriff an sichere Sitzungen koppeln.

  socket.on("webrtc:signal", (data: unknown) => {
    if (!data || typeof data !== "object") return;

    const { targetId, signal } = data as {
      targetId?: unknown;
      signal?: unknown;
    };

    if (
      typeof targetId !== "string" ||
      targetId === socket.id
    ) {
      return;
    }

    if (!signal || typeof signal !== "object") {
      return;
    }

    // Sender und Empfänger müssen aktuell in
    // der Test-Lobby angemeldet sein.
    const senderExists = players.some(
      (player) => player.id === socket.id
    );

    const receiverExists = players.some(
      (player) => player.id === targetId
    );

    if (!senderExists || !receiverExists) {
      return;
    }

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

  // =====================================================
  // VERBINDUNG TRENNEN
  // =====================================================

  socket.on("disconnect", () => {
    const index = players.findIndex(
      (player) => player.id === socket.id
    );

    if (index === -1) return;

    const [leavingPlayer] = players.splice(index, 1);

    console.log(
      "Client getrennt:",
      leavingPlayer.name
    );

    // Wichtig:
    // Niemand erhält beim Verlassen des Gamemasters
    // automatisch dessen Adminrechte.

    broadcastPlayers();
  });
});

// =====================================================
// SERVER STARTEN
// =====================================================

const PORT = Number(process.env.PORT) || 3000;

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Werwolf Engine Server läuft auf Port ${PORT}`
  );
});
