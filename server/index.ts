
import express from "express";
import {createHash, timingSafeEqual, randomBytes, scryptSync} from "crypto";
import { createServer } from "http";
import { Server } from "socket.io";

import type { Player } from "./types/Player";
import type { GamePhase } from "./types/Types";

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

// TODO: Später durch dauerhaft gespeicherte Rate-Limits ersetzen.
const loginAttempts = new Map<
  string,
  { count: number; resetAt: number }
>();

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

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

  
  // =====================================================
  // SPIELERKONTEN ERSTELLEN – NUR GAMEMASTER
  // =====================================================

  socket.on("account:create", (input: unknown) => {
    // Nur ein angemeldeter Gamemaster darf Konten erstellen.
    const admin = players.find(
      (player) =>
        player.id === socket.id &&
        player.userRole === "gamemaster"
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

    // Ein eigenes, zufälliges Passwort für jeden Spieler.
    const password = randomBytes(18).toString("base64url");

    // Nicht das Passwort, sondern nur den Hash speichern.
    const salt = randomBytes(16).toString("hex");

    const passwordHash = scryptSync(
      password,
      salt,
      64
    ).toString("hex");

    playerAccounts.set(accountKey, {
      name,
      passwordHash,
      salt,
    });

    // Das Passwort nur an die Gamemaster-Verbindung senden.
    // Es wird später im Dashboard einmalig angezeigt.
    socket.emit("account:created", {
      name,
      password,
    });

    console.log(`Spielerkonto erstellt: ${name}`);
  });


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
