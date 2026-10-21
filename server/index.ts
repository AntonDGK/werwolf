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

// TODO: Vor dem öffentlichen Betrieb Konten, Sperren und Spielzustand
// dauerhaft speichern. Diese Daten gehen bei einem Neustart verloren.
const players: Player[] = [];

type PlayerAccount = {
  name: string;
  passwordHash: string;
  salt: string;
};

type PublicAccount = {
  name: string;
  online: boolean;
};

const playerAccounts = new Map<string, PlayerAccount>();
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const currentPhase: GamePhase = "lobby";

function accountKey(name: string): string {
  return name.trim().toLocaleLowerCase("de-DE");
}

function isAdmin(socketId: string): boolean {
  return players.some(
    (player) => player.id === socketId && player.userRole === "gamemaster"
  );
}

function findOnlineAccount(name: string): Player | undefined {
  const key = accountKey(name);
  return players.find(
    (player) =>
      player.userRole === "player" && accountKey(player.name) === key
  );
}

function broadcastAccountList(): void {
  const accounts: PublicAccount[] = Array.from(playerAccounts.values())
    .map((account) => ({
      name: account.name,
      online: Boolean(findOnlineAccount(account.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  // Die Kontoliste darf nur der eingeloggte Gamemaster erhalten.
  for (const player of players) {
    if (player.userRole === "gamemaster") {
      io.to(player.id).emit("account:list", accounts);
    }
  }
}

function broadcastPlayers(): void {
  // Keine geheimen Werwolf-Rollen, Kamera-IDs oder Passwörter senden.
  const publicPlayers = players.map((player) => ({
    id: player.id,
    name: player.name,
    userRole: player.userRole,
    color: player.color,
  }));

  // Auch die öffentliche Spielerliste nur angemeldeten Teilnehmern senden.
  for (const player of players) {
    io.to(player.id).emit("players", publicPlayers);
  }

  broadcastAccountList();
}

function disconnectPlayerAccount(name: string, reason: string): boolean {
  const player = findOnlineAccount(name);
  if (!player) return false;

  const activeSocket = io.sockets.sockets.get(player.id);
  if (activeSocket) {
    activeSocket.emit("auth:kicked", reason);
    activeSocket.disconnect(true);
  } else {
    // Falls die Verbindung gerade verschwunden ist: veralteten Eintrag löschen.
    const index = players.findIndex((entry) => entry.id === player.id);
    if (index !== -1) {
      players.splice(index, 1);
      broadcastPlayers();
    }
  }

  return true;
}

function getAccount(input: unknown): PlayerAccount | undefined {
  if (typeof input !== "string" || input.length > 50) return undefined;
  return playerAccounts.get(accountKey(input));
}

function makePasswordCredentials(): {
  password: string;
  salt: string;
  passwordHash: string;
} {
  const password = randomBytes(18).toString("base64url");
  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(password, salt, 64).toString("hex");
  return { password, salt, passwordHash };
}

app.get("/", (_req, res) => {
  res.send("Werwolf Engine Server läuft 🐺");
});

io.on("connection", (socket) => {
  console.log("Client verbunden:", socket.id);

  // =====================================================
  // GAMEMASTER-LOGIN
  // =====================================================
  // TODO: Zusätzlich ein übergreifendes Rate-Limit implementieren.
  // Diese Begrenzung gilt bisher nur pro Socket-Verbindung.
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
  // GAMEMASTER – SPIELERKONTEN VERWALTEN
  // =====================================================

  socket.on("account:list:request", () => {
    if (!isAdmin(socket.id)) {
      socket.emit("account:error", "Keine Berechtigung.");
      return;
    }
    broadcastAccountList();
  });

  socket.on("account:create", (input: unknown) => {
    if (!isAdmin(socket.id)) {
      socket.emit("account:error", "Keine Berechtigung.");
      return;
    }

    if (typeof input !== "string") {
      socket.emit("account:error", "Ungültiger Name.");
      return;
    }

    const name = input.trim();
    const key = accountKey(name);

    if (
      name.length < 2 ||
      name.length > 30 ||
      /[\x00-\x1F\x7F]/.test(name) ||
      key === "gamemaster"
    ) {
      socket.emit("account:error", "Ungültiger Name.");
      return;
    }

    if (playerAccounts.has(key)) {
      socket.emit("account:error", "Für diesen Namen existiert bereits ein Zugang.");
      return;
    }

    const { password, passwordHash, salt } = makePasswordCredentials();
    playerAccounts.set(key, { name, passwordHash, salt });

    // Klartextpasswort nur einmal an diesen Gamemaster senden.
    socket.emit("account:created", { name, password });
    broadcastAccountList();
    console.log(`Spielerkonto erstellt: ${name}`);
  });

  socket.on("account:reset", (input: unknown) => {
    if (!isAdmin(socket.id)) {
      socket.emit("account:error", "Keine Berechtigung.");
      return;
    }

    const account = getAccount(input);
    if (!account) {
      socket.emit("account:error", "Konto nicht gefunden.");
      return;
    }

    const { password, passwordHash, salt } = makePasswordCredentials();
    account.passwordHash = passwordHash;
    account.salt = salt;
    loginAttempts.delete(accountKey(account.name));

    // Bereits angemeldete Sitzung ungültig machen.
    disconnectPlayerAccount(account.name, "Dein Passwort wurde zurückgesetzt.");

    socket.emit("account:reset:done", { name: account.name, password });
    broadcastAccountList();
    console.log(`Passwort zurückgesetzt: ${account.name}`);
  });

  socket.on("account:kick", (input: unknown) => {
    if (!isAdmin(socket.id)) {
      socket.emit("account:error", "Keine Berechtigung.");
      return;
    }

    const account = getAccount(input);
    if (!account) {
      socket.emit("account:error", "Konto nicht gefunden.");
      return;
    }

    if (!disconnectPlayerAccount(account.name, "Du wurdest vom Gamemaster entfernt.")) {
      socket.emit("account:error", "Spieler ist nicht online.");
      return;
    }

    socket.emit("account:kicked", account.name);
    broadcastAccountList();
  });

  socket.on("account:delete", (input: unknown) => {
    if (!isAdmin(socket.id)) {
      socket.emit("account:error", "Keine Berechtigung.");
      return;
    }

    const account = getAccount(input);
    if (!account) {
      socket.emit("account:error", "Konto nicht gefunden.");
      return;
    }

    const key = accountKey(account.name);
    playerAccounts.delete(key);
    loginAttempts.delete(key);
    disconnectPlayerAccount(account.name, "Dein Zugang wurde gelöscht.");

    socket.emit("account:deleted", account.name);
    broadcastAccountList();
    console.log(`Spielerkonto gelöscht: ${account.name}`);
  });

  // =====================================================
  // SPIELER-LOGIN MIT PERSÖNLICHEM PASSWORT
  // =====================================================
  // Kein passwortloser 'join'-Handler mehr.
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

    const key = accountKey(name);
    const now = Date.now();
    const previousAttempts = loginAttempts.get(key);

    if (previousAttempts && previousAttempts.resetAt > now) {
      if (previousAttempts.count >= MAX_LOGIN_ATTEMPTS) {
        socket.emit("auth:error", "Zu viele Anmeldeversuche. Bitte später erneut versuchen.");
        return;
      }
    } else {
      loginAttempts.delete(key);
    }

    const account = playerAccounts.get(key);
    let passwordCorrect = false;

    if (account) {
      const receivedHash = scryptSync(password, account.salt, 64);
      const expectedHash = Buffer.from(account.passwordHash, "hex");
      passwordCorrect =
        receivedHash.length === expectedHash.length &&
        timingSafeEqual(receivedHash, expectedHash);
    }

    if (!account || !passwordCorrect) {
      const attempts = loginAttempts.get(key);
      loginAttempts.set(key, {
        count: (attempts?.count ?? 0) + 1,
        resetAt:
          attempts && attempts.resetAt > now
            ? attempts.resetAt
            : now + LOGIN_WINDOW_MS,
      });
      socket.emit("auth:error", "Anmeldung fehlgeschlagen.");
      return;
    }

    if (findOnlineAccount(account.name)) {
      socket.emit("auth:error", "Dieses Konto ist bereits angemeldet.");
      return;
    }

    loginAttempts.delete(key);

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

    // TODO: Vor öffentlichem Einsatz den GM-Freigabe-Warteraum ergänzen.
  });

  // =====================================================
  // WEBRTC-SIGNALISIERUNG
  // =====================================================
  socket.on("webrtc:signal", (data: unknown) => {
    if (!data || typeof data !== "object") return;

    const { targetId, signal } = data as {
      targetId?: unknown;
      signal?: unknown;
    };

    if (typeof targetId !== "string" || targetId === socket.id) return;
    if (!signal || typeof signal !== "object") return;

    // Bis zum Warteraum: Beide müssen zumindest eingeloggt sein.
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
    // Keine automatische Gamemaster-Übergabe.
    broadcastPlayers();
  });
});

const PORT = Number(process.env.PORT) || 3000;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Werwolf Engine Server läuft auf Port ${PORT}`);
});
