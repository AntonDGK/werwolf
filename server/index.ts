import express from "express";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { createServer } from "http";
import { Server } from "socket.io";

import type { Player } from "./types/Player";
import type { GamePhase } from "./types/Types";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL?.trim() || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

// Vorläufige Speicherung im Arbeitsspeicher.
// TODO: Konten, Sperrungen und Spielzustand dauerhaft speichern.
const players: Player[] = [];

type PlayerAccount = {
  name: string;
  passwordHash: string;
  salt: string;
};

const playerAccounts = new Map<string, PlayerAccount>();

const loginAttempts = new Map<
  string,
  { count: number; resetAt: number }
>();

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

// TODO: Später durch die richtige Werwolf-Spielsteuerung ersetzen.
const currentPhase: GamePhase = "lobby";

function broadcastPlayers(): void {
  // Geheime Rollen oder Passwörter niemals öffentlich senden.
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

  // TODO: Zusätzlich ein übergreifendes Rate-Limit (IP/Account)
  // implementieren. Dieses Limit gilt nur pro Verbindung.
  let failedAdminAttempts = 0;

  socket.on("admin:login", (password: unknown) => {
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword || adminPassword.length < 16) {
      socket.emit("auth:error", "Adminzugang nicht konfiguriert.");
      return;
    }

    if (failedAdminAttempts >= 5) {
      socket.emit("auth:error", "Zu viele Fehlversuche.");
      return;
    }

    if (typeof password !== "string" || password.length > 256) {
      failedAdminAttempts++;
      socket.emit("auth:error", "Anmeldung fehlgeschlagen.");
      return;
    }

    const expected = createHash("sha256").update(adminPassword).digest();
    const received = createHash("sha256").update(password).digest();

    if (!timingSafeEqual(expected, received)) {
      failedAdminAttempts++;
      socket.emit("auth:error", "Anmeldung fehlgeschlagen.");
      return;
    }

    if (players.some((player) => player.id === socket.id)) {
      socket.emit("auth:error", "Bereits angemeldet.");
      return;
    }

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

  // =====================================================
  // SPIELERKONTEN ERSTELLEN – NUR GAMEMASTER
  // =====================================================

  socket.on("account:create", (input: unknown) => {
    const admin = players.find(
      (player) =>
        player.id === socket.id && player.userRole === "gamemaster"
    );

    if (!admin) {
      socket.emit("account:error", "Keine Berechtigung.");
      return;
    }

    if (typeof input !== "string") {
      socket.emit("account:error", "Ungültiger Name.");
      return;
    }

    const name = input.trim();
    const accountKey = name.toLocaleLowerCase("de-DE");

    if (
      name.length < 2 ||
      name.length > 30 ||
      /[\x00-\x1F\x7F]/.test(name) ||
      accountKey === "gamemaster"
    ) {
      socket.emit("account:error", "Ungültiger Name.");
      return;
    }

    if (playerAccounts.has(accountKey)) {
      socket.emit(
        "account:error",
        "Für diesen Namen existiert bereits ein Zugang."
      );
      return;
    }

    const password = randomBytes(18).toString("base64url");
    const salt = randomBytes(16).toString("hex");
    const passwordHash = scryptSync(password, salt, 64).toString("hex");

    playerAccounts.set(accountKey, {
      name,
      passwordHash,
      salt,
    });

    // Das Passwort wird ausschließlich an den angemeldeten
    // Gamemaster-Socket geschickt, niemals an alle Spieler.
    socket.emit("account:created", { name, password });
    console.log(`Spielerkonto erstellt: ${name}`);
  });

  // =====================================================
  // SPIELER-LOGIN MIT PERSÖNLICHEM PASSWORT
  // =====================================================

  // Wichtig: Der alte passwortlose "join"-Handler ist entfernt.
  socket.on("player:login", (input: unknown) => {
    if (players.some((player) => player.id === socket.id)) {
      socket.emit("auth:error", "Bereits angemeldet.");
      return;
    }

    if (!input || typeof input !== "object") {
      socket.emit("auth:error", "Anmeldung fehlgeschlagen.");
      return;
    }

    const { name, password } = input as {
      name?: unknown;
      password?: unknown;
    };

    if (
      typeof name !== "string" ||
      typeof password !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 30 ||
      password.length === 0 ||
      password.length > 256
    ) {
      socket.emit("auth:error", "Anmeldung fehlgeschlagen.");
      return;
    }

    const accountKey = name.trim().toLocaleLowerCase("de-DE");
    const now = Date.now();
    const previousAttempts = loginAttempts.get(accountKey);

    if (previousAttempts && previousAttempts.resetAt > now) {
      if (previousAttempts.count >= MAX_LOGIN_ATTEMPTS) {
        socket.emit(
          "auth:error",
          "Zu viele Anmeldeversuche. Bitte später erneut versuchen."
        );
        return;
      }
    } else {
      loginAttempts.delete(accountKey);
    }

    const account = playerAccounts.get(accountKey);
    let passwordCorrect = false;

    if (account) {
      const receivedHash = scryptSync(password, account.salt, 64);
      const expectedHash = Buffer.from(account.passwordHash, "hex");

      passwordCorrect =
        receivedHash.length === expectedHash.length &&
        timingSafeEqual(receivedHash, expectedHash);
    }

    if (!account || !passwordCorrect) {
      const attempts = loginAttempts.get(accountKey);

      loginAttempts.set(accountKey, {
        count: (attempts?.count ?? 0) + 1,
        resetAt:
          attempts && attempts.resetAt > now
            ? attempts.resetAt
            : now + LOGIN_WINDOW_MS,
      });

      socket.emit("auth:error", "Anmeldung fehlgeschlagen.");
      return;
    }

    if (
      players.some(
        (player) =>
          player.name.toLocaleLowerCase("de-DE") === accountKey
      )
    ) {
      socket.emit("auth:error", "Dieses Konto ist bereits angemeldet.");
      return;
    }

    loginAttempts.delete(accountKey);

    const newPlayer: Player = {
      id: socket.id,
      name: account.name,
      userRole: "player",
      gameRole: null,
      isAlive: true,
      color: null,
    };

    players.push(newPlayer);
    socket.emit("joined");
    socket.emit("phaseChanged", currentPhase);
    broadcastPlayers();
    console.log(`${account.name} hat sich angemeldet.`);

    // TODO: Vor öffentlichem Einsatz zuerst in den
    // GM-Freigabe-Warteraum statt direkt in die Lobby.
  });

  // =====================================================
  // WEBRTC-SIGNALISIERUNG
  // =====================================================

  // Kamerabilder werden nicht über Socket.IO übertragen.
  // TODO: Nur durch den Gamemaster freigegebene Teilnehmer
  // zur WebRTC-Signalisierung zulassen.
  socket.on("webrtc:signal", (data: unknown) => {
    if (!data || typeof data !== "object") return;

    const { targetId, signal } = data as {
      targetId?: unknown;
      signal?: unknown;
    };

    if (typeof targetId !== "string" || targetId === socket.id) return;
    if (!signal || typeof signal !== "object") return;

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

  // =====================================================
  // VERBINDUNG TRENNEN
  // =====================================================

  socket.on("disconnect", () => {
    const index = players.findIndex((player) => player.id === socket.id);
    if (index === -1) return;

    const [leavingPlayer] = players.splice(index, 1);
    console.log("Client getrennt:", leavingPlayer.name);

    // Niemand erhält automatisch Gamemaster-Rechte.
    broadcastPlayers();
  });
});

const PORT = Number(process.env.PORT) || 3000;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Werwolf Engine Server läuft auf Port ${PORT}`);
});
