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

// Kamera-Freigaben gelten nur fuer die aktuelle Socket-Verbindung.
// Keine Kameraquelle oder Geraete-ID wird hier gespeichert.
type CameraStatus = "ready" | "approved" | "blocked";
type CameraEntry = {
  status: CameraStatus;
  epoch: string;
  reviewing: boolean;
  previewSeen: boolean;
};
const cameraEntries = new Map<string, CameraEntry>();

function participant(id: string): Player | undefined {
  return players.find((player) => player.id === id);
}

function broadcastCameras(): void {
  const approved = Array.from(cameraEntries.entries())
    .filter(([id, entry]) => entry.status === "approved" && Boolean(participant(id)))
    .map(([id]) => id);
  const adminList = players
    .filter((player) => player.userRole !== "gamemaster")
    .map((player) => {
      const entry = cameraEntries.get(player.id);
      return {
        id: player.id,
        name: player.name,
        status: entry?.status ?? "off",
        reviewing: entry?.reviewing ?? false,
        previewSeen: entry?.previewSeen ?? false,
      };
    });
  for (const player of players) {
    io.to(player.id).emit("camera:catalog", approved);
    if (player.userRole === "gamemaster") {
      io.to(player.id).emit("camera:admin:list", adminList);
    }
  }
}

function revokeCamera(id: string, block: boolean): void {
  const old = cameraEntries.get(id);
  if (block) {
    cameraEntries.set(id, {
      status: "blocked",
      epoch: randomBytes(16).toString("hex"),
      reviewing: false,
      previewSeen: false,
    });
  } else {
    cameraEntries.delete(id);
  }
  // Alle angemeldeten Browser entfernen den Stream und beenden ihre P2P-Verbindungen.
  // Bei boeswilligen WebRTC-Peers kann ein Signalisierungsserver bestehende
  // Medienverbindungen jedoch nicht physisch erzwingen.
  for (const player of players) {
    io.to(player.id).emit("camera:revoke", { cameraId: id, blocked: block });
  }
  if (old || block) broadcastCameras();
}

function requestCameraViewer(cameraId: string, viewerId: string): void {
  const entry = cameraEntries.get(cameraId);
  const viewer = participant(viewerId);
  if (!entry || !viewer || !participant(cameraId) || cameraId === viewerId) return;
  if (viewer.userRole === "gamemaster") {
    if (!entry.reviewing && entry.status !== "approved") return;
  } else if (entry.status !== "approved") {
    return;
  }
  io.to(cameraId).emit("camera:requestViewer", { viewerId, epoch: entry.epoch });
}

function notifyNewViewer(viewerId: string): void {
  for (const [cameraId, entry] of cameraEntries) {
    if (entry.status === "approved") requestCameraViewer(cameraId, viewerId);
  }
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
let currentPhase: GamePhase = "lobby";

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
      player.userRole !== "gamemaster" &&
      accountKey(player.name) === key
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

// Zentrale Hilfsfunktion für serverseitige Änderungen an Spielern.
// Bewusst KEIN allgemeines Socket-Event: Clients dürfen nicht selbst
// ihre Rolle, Geheimrolle oder andere Spielwerte ändern.
type PlayerUpdate = Partial<
  Pick<Player, "userRole" | "gameRole" | "isAlive" | "color">
>;

function updatePlayer(
  playerId: string,
  changes: PlayerUpdate
): Player | undefined {
  const player = players.find((entry) => entry.id === playerId);
  if (!player) return undefined;

  const previousUserRole = player.userRole;
  Object.assign(player, changes);

  // Nur die öffentliche Berechtigungsrolle wird dem Betroffenen gemeldet.
  // Die geheime gameRole wird hier ausdrücklich NICHT versendet.
  if (previousUserRole !== player.userRole) {
    io.to(player.id).emit("role:changed", player.userRole);
  }

  // broadcastPlayers() erfolgt nach allen zusammengehörigen Änderungen
  // im jeweiligen Handler, damit nicht mehrfach gesendet wird.
  return player;
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
    broadcastCameras();
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
    broadcastCameras();
    notifyNewViewer(socket.id);
    console.log(`${account.name} hat sich angemeldet.`);

    // Kein zusätzlicher Freigabe-Warteraum vorgesehen: Kontrolle durch
    // persönliche Spielerpasswörter und den Gamemaster vor dem Stream.
  });

  // =====================================================
  // GAMEMASTER – ERZÄHLER ERNENNEN / ABSETZEN
  // =====================================================
  socket.on("storyteller:set", (targetId: unknown) => {
    if (!isAdmin(socket.id)) {
      socket.emit("storyteller:error", "Keine Berechtigung.");
      return;
    }

    // null setzt den Erzähler ab, eine Socket-ID ernennt einen Spieler.
    if (targetId !== null && typeof targetId !== "string") {
      socket.emit("storyteller:error", "Ungültiger Spieler.");
      return;
    }

    // Nie den Gamemaster zur Zielperson machen.
    const target =
      targetId === null
        ? undefined
        : players.find(
            (player) =>
              player.id === targetId && player.userRole !== "gamemaster"
          );

    // Erst validieren, danach Rollen verändern.
    if (targetId !== null && !target) {
      socket.emit("storyteller:error", "Spieler nicht gefunden.");
      return;
    }

    // Es gibt maximal einen Erzähler. Bei einem Wechsel wird der
    // vorherige Erzähler wieder zu einem normalen Spieler.
    for (const player of players) {
      if (player.userRole === "storyteller" && player.id !== targetId) {
        updatePlayer(player.id, { userRole: "player" });
      }
    }

    // Der neue Erzähler bleibt Inhaber seines vorhandenen Spielerkontos.
    if (target && target.userRole !== "storyteller") {
      updatePlayer(target.id, { userRole: "storyteller" });
      console.log(`${target.name} wurde zum Erzähler ernannt.`);
    } else if (targetId === null) {
      console.log("Erzählerberechtigung entfernt.");
    }

    // Geheimrollen werden weiterhin nicht an alle verteilt.
    broadcastPlayers();
    socket.emit("storyteller:updated");
  });
// =====================================================
// SPIELPHASEN-STEUERUNG
// =====================================================

  socket.on("phase:set", (nextPhase: unknown) => {
    const player = players.find(
      (player) => player.id === socket.id
    );

    // Nur Gamemaster und Erzähler dürfen steuern.
    if (
      player?.userRole !== "gamemaster" &&
      player?.userRole !== "storyteller"
    ) {
      socket.emit("phase:error", "Keine Berechtigung.");
      return;
    }

    const validPhases: GamePhase[] = [
      "lobby",
      "preparation",
      "night",
      "day",
      "finished",
    ];

    if (
      typeof nextPhase !== "string" ||
      !validPhases.includes(nextPhase as GamePhase)
    ) {
      socket.emit("phase:error", "Ungültige Spielphase.");
      return;
    }

    currentPhase = nextPhase as GamePhase;

    // Neue Phase an alle angemeldeten Teilnehmer senden.
    for (const participant of players) {
      io.to(participant.id).emit("phaseChanged", currentPhase);
    }

    console.log(
      `${player.name} hat die Spielphase auf ${currentPhase} gesetzt.`
    );
  });

  // =====================================================
  // KAMERA-FREIGABEN: GAMEMASTER PRUEFT, DANN VERTEILEN
  // =====================================================

  socket.on("camera:ready", () => {
    const user = participant(socket.id);
    if (!user || user.userRole === "gamemaster") return;
    if (cameraEntries.get(socket.id)?.status === "blocked") {
      socket.emit("camera:error", "Kamera nach PANIC gesperrt. Gamemaster muss die erneute Einrichtung erlauben.");
      return;
    }
    // Eine laufende Pruefung/Freigabe kann nicht heimlich erneut gestartet werden.
    // Zum Wechseln muss die alte Kamera zuerst ausgeschaltet werden.
    if (cameraEntries.has(socket.id)) {
      socket.emit("camera:error", "Kamera bereits angeboten. Erst ausschalten und neu einrichten.");
      return;
    }
    const entry: CameraEntry = {
      status: "ready",
      epoch: randomBytes(16).toString("hex"),
      reviewing: false,
      previewSeen: false,
    };
    cameraEntries.set(socket.id, entry);
    socket.emit("camera:ownerState", { status: entry.status, epoch: entry.epoch });
    broadcastCameras();
  });

  socket.on("camera:cancel", () => {
    const entry = cameraEntries.get(socket.id);
    if (!entry || entry.status === "blocked") return;
    revokeCamera(socket.id, false);
    socket.emit("camera:ownerState", { status: "off", epoch: null });
  });

  socket.on("camera:preview:start", (cameraId: unknown) => {
    if (!isAdmin(socket.id) || typeof cameraId !== "string") return;
    const entry = cameraEntries.get(cameraId);
    if (!entry || (entry.status !== "ready" && entry.status !== "approved")) return;
    entry.reviewing = true;
    entry.previewSeen = false;
    // Nur dem Gamemaster wird die Kameraverbindung zur privaten Pruefung angeboten.
    requestCameraViewer(cameraId, socket.id);
    broadcastCameras();
  });

  socket.on("camera:preview:received", (cameraId: unknown) => {
    if (!isAdmin(socket.id) || typeof cameraId !== "string") return;
    const entry = cameraEntries.get(cameraId);
    if (!entry?.reviewing) return;
    entry.previewSeen = true;
    broadcastCameras();
  });

  socket.on("camera:preview:stop", (cameraId: unknown) => {
    if (!isAdmin(socket.id) || typeof cameraId !== "string") return;
    const entry = cameraEntries.get(cameraId);
    if (!entry) return;
    entry.reviewing = false;
    entry.previewSeen = false;
    // Freigegebene Kameras bleiben in der Gamemaster-Spielansicht sichtbar.
    // Nur die exklusive Vorabkontrolle einer noch nicht freigegebenen Kamera endet.
    if (entry.status !== "approved") {
      io.to(cameraId).emit("camera:viewer:removed", { viewerId: socket.id });
      socket.emit("camera:viewer:stop", { cameraId });
    }
    broadcastCameras();
  });

  socket.on("camera:approve", (cameraId: unknown) => {
    if (!isAdmin(socket.id) || typeof cameraId !== "string") return;
    const entry = cameraEntries.get(cameraId);
    if (!entry || entry.status !== "ready" || !entry.reviewing || !entry.previewSeen) {
      socket.emit("camera:error", "Zuerst eine echte Kontrollvorschau oeffnen und pruefen.");
      return;
    }
    entry.status = "approved";
    io.to(cameraId).emit("camera:ownerState", { status: "approved", epoch: entry.epoch });
    for (const viewer of players) {
      if (viewer.id !== cameraId) requestCameraViewer(cameraId, viewer.id);
    }
    broadcastCameras();
  });

  socket.on("camera:panic", (cameraId: unknown) => {
    if (!isAdmin(socket.id) || typeof cameraId !== "string") return;
    if (!participant(cameraId) || participant(cameraId)?.userRole === "gamemaster") return;
    revokeCamera(cameraId, true);
  });

  socket.on("camera:panic:all", () => {
    if (!isAdmin(socket.id)) return;
    for (const player of players) {
      if (player.userRole !== "gamemaster") revokeCamera(player.id, true);
    }
    broadcastCameras();
  });

  socket.on("camera:unblock", (cameraId: unknown) => {
    if (!isAdmin(socket.id) || typeof cameraId !== "string") return;
    const entry = cameraEntries.get(cameraId);
    if (!entry || entry.status !== "blocked") return;
    cameraEntries.delete(cameraId);
    io.to(cameraId).emit("camera:unblocked");
    broadcastCameras();
  });

  // Signalisiert ausschliesslich durch den Server erlaubte Kamerapaare.
  // Kamerabesitzer startet immer das Offer, Zuschauer antwortet.
  socket.on("camera:signal", (input: unknown) => {
    if (!input || typeof input !== "object") return;
    const { cameraId, targetId, epoch, signal } = input as {
      cameraId?: unknown; targetId?: unknown; epoch?: unknown; signal?: unknown;
    };
    if (typeof cameraId !== "string" || typeof targetId !== "string" ||
        typeof epoch !== "string" || !signal || typeof signal !== "object") return;
    if (!participant(socket.id) || !participant(cameraId) || !participant(targetId)) return;
    const ownerSending =
      socket.id === cameraId && targetId !== cameraId;

    const viewerReplying =
      socket.id !== cameraId && targetId === cameraId;

    if (!ownerSending && !viewerReplying) return;    const entry = cameraEntries.get(cameraId);
    if (!entry || entry.epoch !== epoch || entry.status === "blocked") return;
    const viewerId = cameraId === socket.id ? targetId : socket.id;
    const viewer = participant(viewerId);
    const permitted = viewer?.userRole === "gamemaster"
      ? entry.reviewing || entry.status === "approved"
      : entry.status === "approved";
    if (!permitted) return;
    const { type, sessionId } = signal as { type?: unknown; sessionId?: unknown };
    if (typeof sessionId !== "string" || sessionId.length < 8 || sessionId.length > 128) return;
    if (type !== "offer" && type !== "answer" && type !== "ice" && type !== "stop") return;
    if (type === "offer" && socket.id !== cameraId) return;
    if (type === "answer" && socket.id !== viewerId) return;
    // SDP/ICE Laenge begrenzen; auch wenn Socket.IO keine Video-Frames transportiert.
    try {
      if (JSON.stringify(signal).length > 32768) return;
    } catch {
      return;
    }
    io.to(targetId).emit("camera:signal", { senderId: socket.id, cameraId, epoch, signal });
  });

  // Alter passwortloser Kamera-Techniktest (`webrtc:signal`) ist ABSICHTLICH
  // entfernt. Sonst koennten alte Clients die neue Kamera-Freigabe umgehen.
  // Ausschliesslich `camera:signal` wird mit der Server-Freigabe vermittelt.

  // =====================================================
  // VERBINDUNG TRENNEN
  // =====================================================
  socket.on("disconnect", () => {
    const disconnectedUser = participant(socket.id);
    if (disconnectedUser?.userRole === "gamemaster") {
      // Fail-closed: Ohne Gamemaster-Pruefung keine automatische Wiederfreigabe.
      for (const [cameraId, entry] of cameraEntries) {
        if (entry.status !== "blocked") revokeCamera(cameraId, true);
      }
    } else if (cameraEntries.has(socket.id)) {
      revokeCamera(socket.id, false);
    }
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
