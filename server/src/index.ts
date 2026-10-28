import express from "express";
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "crypto";
import { createServer } from "http";
import { Server } from "socket.io";

import type { Player } from "./types/Player";
import type { GamePhase } from "./types/Types";
import { RoleManager } from "./roles/RoleManager";
import { NightStateManager } from "./roles/NightStateManager";
import type { RoleActionPhase, RoleActionPlayer, RoleEffect } from "./roles/RoleTypes";
import { resolveRoleEffects } from "./roles/RoleEffectResolver";
import { PhaseManager } from "./game/PhaseManager";
import { DayVoteManager } from "./game/DayVoteManager";
import { decideWinner, type WinDecision, type WinCheckpoint } from "./game/GameEndManager";

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
const gameRolesByAccount = new Map<string, string>();
const aliveByAccount = new Map<string, boolean>();
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

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
const roleManager = new RoleManager();
const nightState = new NightStateManager();
const phaseManager = new PhaseManager(roleManager);
const dayVotes = new DayVoteManager();

type RoleDistributionSettings = {
  enabled: boolean;
  counts: Record<string, number>;
};
const roleDistributionSettings: RoleDistributionSettings = {
  enabled: false,
  counts: Object.fromEntries(roleManager.getPublicCatalog().map(role => [
    role.id, role.id === "werewolf" ? 2 : role.id === "seer" ? 1 : 0,
  ])),
};

function isController(player: Player | undefined): player is Player {
  return Boolean(player && (player.userRole === "gamemaster" || player.userRole === "storyteller"));
}

// Stabile Konto-IDs
function roleActionPlayer(player: Player): RoleActionPlayer {
  const id = accountKey(player.name);
  return {
    id,
    userRole: player.userRole,
    gameRole: player.gameRole,
    isAlive: player.isAlive && roundParticipantKeys.has(id),
  };
}

// Rundenrollen, inkl. offline
function roundRolePlayers(): RoleActionPlayer[] {
  return [...roundParticipantKeys].filter(key => playerAccounts.has(key)).map(key => ({
    id: key,
    userRole: "player" as const,
    gameRole: gameRolesByAccount.get(key) ?? null,
    isAlive: aliveByAccount.get(key) ?? true,
  }));
}

function applyRoleEffects(effects: readonly RoleEffect[]): void {
  const roundPlayers = roundRolePlayers();
  const resolved = resolveRoleEffects(effects, roundPlayers);
  let eliminated = false;

  for (const effect of resolved.eliminated) {
    const target = roundPlayers.find(p => p.id === effect.targetId);
    if (!target) continue;
    aliveByAccount.set(target.id, false);
    const online = players.find(p => p.userRole === "player" && accountKey(p.name) === target.id);
    if (online) updatePlayer(online.id, { isAlive: false });
    else roleManager.notifyDeath(target);
    eliminated = true;
    for (const receiver of players) {
      io.to(receiver.id).emit("role:eliminated", {
        playerId: online?.id ?? null,
        name: playerAccounts.get(target.id)?.name ?? "Spieler",
        reason: effect.reason,
      });
    }
  }

  for (const targetId of resolved.revealed) {
    const roleId = gameRolesByAccount.get(targetId) ?? null;
    const roleName = roleId ? roleManager.getRole(roleId)?.config.name ?? roleId : "Dorfbewohner";
    for (const receiver of players) {
      io.to(receiver.id).emit("role:revealed", {
        playerId: players.find(p => p.userRole === "player" && accountKey(p.name) === targetId)?.id ?? null,
        name: playerAccounts.get(targetId)?.name ?? "Spieler",
        roleId,
        roleName,
      });
    }
  }
  if (eliminated) broadcastPlayers();
}

function completeCurrentRoleStep(): void {
  const phase = currentRoleActionPhase();
  if (!phase) return;
  const participants = roundRolePlayers();
  roleManager.completeStep(phase, participants);
  if (phase.period === "night" && phase.stepId !== null) {
    nightState.completeStep(phase.stepId, () =>
      roleManager.runNightStepEnd(phase, participants, nightState));
  }
}

function finishNight(): boolean {
  const phase = currentRoleActionPhase();
  if (!phase || phase.period !== "night") return false;
  completeCurrentRoleStep();
  nightState.record(roleManager.runEvent("onNightEnd", roundRolePlayers(), phase.round, nightState));
  applyRoleEffects(nightState.getEffects());
  nightState.reset();
  return finishIfWinner("night-end");
}

function currentRoleActionPhase(): RoleActionPhase | null {
  const status = phaseManager.getStatus();
  if (status.phase !== "night" && status.phase !== "day") return null;
  return { period: status.phase, stepId: status.step, round: status.round };
}

function sendRoleProgress(): void {
  const phase = currentRoleActionPhase();
  if (!phase) return;
  const progress = roleManager.getConfirmationProgress(
    players.filter((player) => player.userRole === "player").map(roleActionPlayer),
    phase,
  );
  for (const controller of players.filter(isController)) {
    io.to(controller.id).emit("role:progress", progress);
  }
}

// Private Aktionsfreigabe für jeden Spieler.
function sendRoleState(receiver: Player): void {
  const inactive = {
    active: false, requiresConfirmation: false, confirmed: false,
    hasSelection: false, selectedTargetId: null as string | null,
    targetIds: [] as string[], buttons: [] as { id: string; label: string; disabled: boolean }[],
    nightInfo: null as { werewolfTargetId: string | null } | null,
  };
  const phase = currentRoleActionPhase();
  if (receiver.userRole !== "player" || !phase) {
    io.to(receiver.id).emit("role:state", inactive);
    return;
  }

  const action = roleManager.getActionState(
    roleActionPlayer(receiver),
    phase,
    players.filter(p => p.userRole === "player").map(roleActionPlayer),
    nightState,
  );
  const socketIdForAccount = (key: string): string | null =>
    players.find(p => p.userRole === "player" && accountKey(p.name) === key)?.id ?? null;

  io.to(receiver.id).emit("role:state", {
    active: action.active,
    requiresConfirmation: action.requiresConfirmation,
    confirmed: action.confirmed,
    buttons: action.buttons,
    nightInfo: action.nightInfo ? {
      werewolfTargetId: action.nightInfo.werewolfTargetId
        ? socketIdForAccount(action.nightInfo.werewolfTargetId) : null,
    } : null,
    hasSelection: action.selectionId !== null,
    selectedTargetId: action.selectionId ? socketIdForAccount(action.selectionId) : null,
    targetIds: action.allowedTargetIds
      .map(socketIdForAccount)
      .filter((id): id is string => id !== null),
  });
}

function syncRoleStates(): void {
  for (const player of players) sendRoleState(player);
}

function distributionStatus() {
  return {
    enabled: roleDistributionSettings.enabled,
    counts: { ...roleDistributionSettings.counts },
    catalog: roleManager.getPublicCatalog(),
    playerCount: players.filter(p => p.userRole === "player").length,
  };
}

function sendDistributionStatus(player: Player): void {
  if (isController(player)) io.to(player.id).emit("role-distribution:status", distributionStatus());
}

function syncDistributionStatus(): void {
  for (const player of players) sendDistributionStatus(player);
}

function distributeRolesForNewRound(): boolean {
  if (!roleDistributionSettings.enabled) return true;
  const participants = players.filter(p => p.userRole === "player");
  const specialRoleIds: string[] = [];
  for (const [id, count] of Object.entries(roleDistributionSettings.counts)) {
    if (!roleManager.isValidRoleId(id) || !Number.isSafeInteger(count) || count < 0) return false;
    for (let n = 0; n < count; n++) specialRoleIds.push(id);
  }
  if (specialRoleIds.length > participants.length) return false;

  for (let i = specialRoleIds.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [specialRoleIds[i], specialRoleIds[j]] = [specialRoleIds[j], specialRoleIds[i]];
  }
  const shuffled = [...participants];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  gameRolesByAccount.clear();
  for (const player of participants) player.gameRole = null;
  shuffled.forEach((player, index) => {
    const id = specialRoleIds[index] ?? null;
    player.gameRole = id;
    if (id !== null) gameRolesByAccount.set(accountKey(player.name), id);
  });
  syncGameRoles();
  broadcastControllerPhaseStatus();
  return true;
}

function controllerPhaseStatus() {
  return {
    ...phaseManager.getStatus(),
    nightSteps: phaseManager.getNightTimeline(
      roundParticipantKeys.size ? roundRolePlayers() : players,
    ).map((entry) => ({
      id: entry.id,
      label: entry.id === "werewolves" ? "Werwölfe" :
        entry.roleIds.map((id) => roleManager.getRole(id)?.config.name ?? id).join(" / "),
    })),
  };
}

function sendControllerPhaseStatus(id: string): void {
  io.to(id).emit("phase:step:changed", controllerPhaseStatus());
}

function broadcastControllerPhaseStatus(): void {
  for (const controller of players.filter((p) => p.userRole !== "player")) {
    sendControllerPhaseStatus(controller.id);
  }
}


const roundParticipantKeys = new Set<string>();
let startedWithWerewolves = false;
let gameResult: WinDecision | null = null;
let restartTimeout: ReturnType<typeof setTimeout> | null = null;
const AUTO_RESTART_DELAY_MS = 10_000;
const gameEndSettings = { winDetectionEnabled: true };

function cancelAutomaticRestart(): void {
  if (restartTimeout !== null) clearTimeout(restartTimeout);
  restartTimeout = null;
}

function sendGameResultTo(receiver: Player): void {
  io.to(receiver.id).emit("game:result", gameResult === null ? null : {
    ...gameResult,
    autoRestartOnWin: true,
    restartDelayMs: AUTO_RESTART_DELAY_MS,
  });
  if (receiver.userRole === "gamemaster") {
    io.to(receiver.id).emit("game:admin-settings", { ...gameEndSettings });
  }
}

function broadcastGameResult(): void {
  for (const receiver of players) sendGameResultTo(receiver);
}

function scheduleAutomaticRestart(): void {
  cancelAutomaticRestart();
  if (!gameResult || phaseManager.currentPhase !== "finished") return;
  restartTimeout = setTimeout(() => {
    restartTimeout = null;
    if (phaseManager.currentPhase === "finished" && gameResult) {
      setGamePhase("lobby");
    }
  }, AUTO_RESTART_DELAY_MS);
}

/** Nur nach einer wirksamen Elimination am Tag oder nach Ende der Nacht. */
function finishIfWinner(checkpoint: WinCheckpoint): boolean {
  if (!gameEndSettings.winDetectionEnabled || gameResult || !startedWithWerewolves || roundParticipantKeys.size === 0) return false;
  const participants = [...roundParticipantKeys]
    .filter(key => playerAccounts.has(key))
    .map(key => ({
      roleId: gameRolesByAccount.get(key) ?? null,
      isAlive: aliveByAccount.get(key) ?? true,
    }));
  const decision = decideWinner(participants, checkpoint);
  if (!decision) return false;
  gameResult = decision;
  setGamePhase("finished");
  broadcastGameResult();
  scheduleAutomaticRestart();
  return true;
}

const sceneSettings = {
  gmRoleFramesPermanent: false, // GM sieht wahre Rollen nachts immer; tagsüber optional
  blockNightOutsideOwnPhase: false,
};

function sendSceneSettingsTo(viewer: Player): void {
  const isNight = phaseManager.currentPhase === "night";
  const canSeeNightCameras = viewer.userRole !== "player" || (
    viewer.isAlive && viewer.gameRole !== null && phaseManager.getActiveRoleIds().includes(viewer.gameRole)
  );
  io.to(viewer.id).emit("scene:viewer-settings", {
    revealGamemasterRoles: viewer.userRole === "gamemaster" &&
      (sceneSettings.gmRoleFramesPermanent || isNight),
    maskNightCameras: isNight && sceneSettings.blockNightOutsideOwnPhase && !canSeeNightCameras,
  });
  if (viewer.userRole === "gamemaster") {
    io.to(viewer.id).emit("scene:admin-settings", { ...sceneSettings });
  }
}

function syncSceneSettings(): void {
  for (const viewer of players) sendSceneSettingsTo(viewer);
}

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

  for (const player of players) {
    if (player.userRole === "gamemaster") {
      io.to(player.id).emit("account:list", accounts);
    }
  }
}

function syncGameRoles(): void {
  const available = roleManager.getPublicCatalog();
  const byId = new Map(available.map((entry) => [entry.id, entry]));
  const assignments = players
    .filter((p) => p.userRole === "player")
    .map((p) => ({ playerId: p.id, roleId: p.gameRole }));
  for (const receiver of players) {
    if (receiver.userRole === "gamemaster") {
      io.to(receiver.id).emit("game-role:assignments", assignments);
      continue;
    }
    const assigned = receiver.userRole === "player" && receiver.gameRole
      ? byId.get(receiver.gameRole) ?? null
      : null;
    io.to(receiver.id).emit("game-role:self", assigned
      ? { roleId: assigned.id, name: assigned.name }
      : { roleId: null, name: null });
    const teammates = receiver.userRole === "player" && receiver.gameRole === "werewolf"
      ? players.filter((p) => p.userRole === "player" && p.gameRole === "werewolf" && p.id !== receiver.id)
          .map((p) => ({ id: p.id, name: p.name }))
      : [];
    io.to(receiver.id).emit("game-role:teammates", teammates);
  }
}

function dayVoteWeight(voterKey: string): number {
  return roleManager.getDayVoteWeight({
    id: voterKey,
    userRole: "player",
    gameRole: gameRolesByAccount.get(voterKey) ?? null,
    isAlive: roundParticipantKeys.has(voterKey) && (aliveByAccount.get(voterKey) ?? true),
  });
}

function syncDayVotes(): void {
  const eligible = players.filter(p => p.userRole === "player" && p.isAlive);
  const voterCount = Math.max(eligible.length, dayVotes.voteCount);
  for (const receiver of players) {
    const view = dayVotes.getSharedStatus(
      voterCount, playerAccounts, receiver.userRole === "gamemaster" || receiver.userRole === "storyteller",
      dayVoteWeight,
    );
    io.to(receiver.id).emit("day-vote:status", {
      ...view,
      myVote: receiver.userRole === "player"
        ? dayVotes.getSelection(accountKey(receiver.name), playerAccounts)
        : null,
    });
  }
}

/** Schliessen = Ergebnis veroeffentlichen und eindeutigen Sieger eliminieren. */
function closeAndRevealDayVote(): void {
  if (phaseManager.currentPhase !== "day" || dayVotes.currentState !== "open") return;
  dayVotes.close(playerAccounts, dayVoteWeight);
  const winnerKey = dayVotes.getUniqueWinner(playerAccounts);
  if (winnerKey !== null) {
    aliveByAccount.set(winnerKey, false);
    const target = players.find(
      p => p.userRole === "player" && accountKey(p.name) === winnerKey,
    );
    if (target) {
      updatePlayer(target.id, { isAlive: false });
      broadcastPlayers();
      for (const viewer of players) {
        io.to(viewer.id).emit("day-vote:eliminated", { playerId: target.id, reason: "day-vote" });
      }
      finishIfWinner("day-vote");
      return;
    }
  }
  syncDayVotes();
}

function broadcastPlayers(): void {
  // Keine geheimen Werwolf-Rollen, Kamera-IDs oder Passwörter senden.
  const publicPlayers = players.map((player) => ({
    id: player.id,
    name: player.name,
    userRole: player.userRole,
    color: player.color,
    isAlive: player.isAlive,
  }));

  // Auch die öffentliche Spielerliste nur angemeldeten Teilnehmern senden.
  for (const player of players) {
    io.to(player.id).emit("players", publicPlayers);
  }

  broadcastAccountList();
  syncGameRoles();
  syncDayVotes();
  syncSceneSettings();
  syncDistributionStatus();
  syncRoleStates();
}

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
  const died = player.isAlive && changes.isAlive === false;
  Object.assign(player, changes);
  if (died) roleManager.notifyDeath(roleActionPlayer(player));

  if (previousUserRole !== player.userRole) {
    io.to(player.id).emit("role:changed", player.userRole);
  }

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

function setGamePhase(nextPhase: GamePhase): void {
  const previousPhase = phaseManager.currentPhase;
  if (previousPhase === "night" && nextPhase === "day" && finishNight()) return;
  if ((nextPhase === "night" || nextPhase === "day") &&
      (previousPhase === "preparation" || previousPhase === "lobby") &&
      phaseManager.getStatus().round === 0) {
    if (!distributeRolesForNewRound()) {
      for (const controller of players.filter(isController)) {
        io.to(controller.id).emit("phase:error", "Zu viele Spezialrollen fuer die angemeldeten Spieler. Bitte Rollenanzahlen anpassen.");
      }
      return;
    }
  }
  if (previousPhase === "day" && nextPhase === "night") {
    applyRoleEffects(roleManager.runEvent("onDayEnd", roundRolePlayers(), phaseManager.getStatus().round));
  }
  if (nextPhase === "lobby") {
    nightState.reset();
    cancelAutomaticRestart();
    gameResult = null;
    roundParticipantKeys.clear();
    startedWithWerewolves = false;
  }
  if (nextPhase === "night" && phaseManager.getStatus().round === 0) {
    roundParticipantKeys.clear();
    for (const p of players) {
      if (p.userRole === "player") roundParticipantKeys.add(accountKey(p.name));
    }
    startedWithWerewolves = [...roundParticipantKeys].some(
      key => gameRolesByAccount.get(key) === "werewolf",
    );
  }
  if (nextPhase !== "finished" && nextPhase !== "lobby" && previousPhase === "finished") {
    cancelAutomaticRestart();
    gameResult = null;
  }
  const status = phaseManager.setPhase(nextPhase,
    roundParticipantKeys.size ? roundRolePlayers() : players);
  if (previousPhase !== status.phase) {
    if (status.phase === "lobby") {
      roleManager.resetGame();
    } else if (status.phase === "night") {
      nightState.reset();
      roleManager.resetRoleActions();
    } else {
      roleManager.resetConfirmations();
    }
    if (status.phase === "finished" || status.phase === "preparation") nightState.reset();
    if (status.phase !== "finished") dayVotes.reset();
    if (status.phase === "night") {
      nightState.record(roleManager.runEvent("onNightStart", roundRolePlayers(), status.round, nightState));
    }
    if (status.phase === "day") {
      applyRoleEffects(roleManager.runEvent("onDayStart", roundRolePlayers(), status.round));
    }
    if (status.phase === "lobby") {
      aliveByAccount.clear();
      for (const p of players) p.isAlive = true;
      broadcastPlayers();
      broadcastGameResult();
    }
    syncDayVotes();
  }
  syncSceneSettings();
  for (const recipient of players) io.to(recipient.id).emit("phaseChanged", status.phase);
  broadcastControllerPhaseStatus();
  sendRoleProgress();
  syncRoleStates();
}

io.on("connection", (socket) => {
  console.log("Client verbunden:", socket.id);

  // Gamemaster-Login
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
    socket.emit("phase:step:changed", controllerPhaseStatus());
    socket.emit("phaseChanged", phaseManager.currentPhase);
    socket.emit("role:catalog", roleManager.getPublicCatalog());
    broadcastPlayers();
    broadcastCameras();
    sendGameResultTo(admin);
    console.log("Gamemaster erfolgreich angemeldet.");
  });

  // Spielerkonten

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
    gameRolesByAccount.delete(key);
    aliveByAccount.delete(key);
    dayVotes.removeAccount(key);
    loginAttempts.delete(key);
    disconnectPlayerAccount(account.name, "Dein Zugang wurde gelöscht.");

    socket.emit("account:deleted", account.name);
    broadcastAccountList();
    console.log(`Spielerkonto gelöscht: ${account.name}`);
  });

  // Spieler-Login
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
      gameRole: gameRolesByAccount.get(key) ?? null,
      isAlive: aliveByAccount.get(key) ?? true,
      color: null,
    };

    players.push(newPlayer);
    socket.emit("joined");
    socket.emit("phaseChanged", phaseManager.currentPhase);
    socket.emit("role:catalog", roleManager.getPublicCatalog());
    broadcastPlayers();
    broadcastCameras();
    notifyNewViewer(socket.id);
    sendGameResultTo(newPlayer);
    console.log(`${account.name} hat sich angemeldet.`);

  });

  // Erzähler verwalten
  socket.on("storyteller:set", (targetId: unknown) => {
    if (!isAdmin(socket.id)) {
      socket.emit("storyteller:error", "Keine Berechtigung.");
      return;
    }

    if (targetId !== null && typeof targetId !== "string") {
      socket.emit("storyteller:error", "Ungültiger Spieler.");
      return;
    }

    const target =
      targetId === null
        ? undefined
        : players.find(
            (player) =>
              player.id === targetId && player.userRole !== "gamemaster"
          );

    if (targetId !== null && !target) {
      socket.emit("storyteller:error", "Spieler nicht gefunden.");
      return;
    }

    for (const player of players) {
      if (player.userRole === "storyteller" && player.id !== targetId) {
        updatePlayer(player.id, { userRole: "player" });
      }
    }

    if (target && target.userRole !== "storyteller") {
      gameRolesByAccount.delete(accountKey(target.name));
      dayVotes.removeAccount(accountKey(target.name));
      updatePlayer(target.id, { userRole: "storyteller", gameRole: null });
      sendControllerPhaseStatus(target.id);
      console.log(`${target.name} wurde zum Erzähler ernannt.`);
    } else if (targetId === null) {
      console.log("Erzählerberechtigung entfernt.");
    }

    broadcastPlayers();
    sendRoleProgress();
    socket.emit("storyteller:updated");
  });
  // Rollenvergabe
  socket.on("role-distribution:request", () => {
    const controller = participant(socket.id);
    if (isController(controller)) sendDistributionStatus(controller);
  });
  socket.on("role-distribution:update", (input: unknown) => {
    const controller = participant(socket.id);
    if (!isController(controller)) return;
    if (!input || typeof input !== "object" || Array.isArray(input)) return;
    const data = input as Record<string, unknown>;
    if (data.type === "enabled" &&
        Object.keys(data).length === 2 &&
        typeof data.enabled === "boolean") {
      roleDistributionSettings.enabled = data.enabled;
    } else if (data.type === "count" && Object.keys(data).length === 3 &&
        roleManager.isValidRoleId(data.roleId) &&
        typeof data.count === "number" &&
        Number.isSafeInteger(data.count) && data.count >= 0 && data.count <= 100) {
      roleDistributionSettings.counts[data.roleId as string] = data.count;
    } else {
      socket.emit("role-distribution:error", "Ungueltige Rolleneinstellung.");
      return;
    }
    syncDistributionStatus();
  });

  socket.on("game-role:request", () => {
    if (!isAdmin(socket.id)) return;
    socket.emit("role:catalog", roleManager.getPublicCatalog());
    socket.emit("game-role:assignments", players
      .filter((p) => p.userRole === "player")
      .map((p) => ({ playerId: p.id, roleId: p.gameRole })));
  });

  socket.on("game-role:assign", (input: unknown) => {
    if (!isAdmin(socket.id)) {
      socket.emit("game-role:error", "Keine Berechtigung.");
      return;
    }
    if (phaseManager.currentPhase !== "lobby" && phaseManager.currentPhase !== "preparation") {
      socket.emit("game-role:error", "Rollen koennen nur vor Spielbeginn geaendert werden.");
      return;
    }
    if (!input || typeof input !== "object") {
      socket.emit("game-role:error", "Ungueltige Eingabe.");
      return;
    }
    const { playerId, roleId } = input as { playerId?: unknown; roleId?: unknown };
    if (typeof playerId !== "string" ||
      (roleId !== null && !roleManager.isValidRoleId(roleId))) {
      socket.emit("game-role:error", "Spieler oder Rolle ungueltig.");
      return;
    }
    const target = participant(playerId);
    if (!target || target.userRole !== "player") {
      socket.emit("game-role:error", "Nur angemeldeten Spielern kann eine Rolle zugewiesen werden.");
      return;
    }
    if (roleId === null) gameRolesByAccount.delete(accountKey(target.name));
    else gameRolesByAccount.set(accountKey(target.name), roleId as string);
    updatePlayer(target.id, { gameRole: roleId as string | null });
    syncGameRoles();
    syncRoleStates();
    broadcastControllerPhaseStatus();
    sendRoleProgress();
    socket.emit("game-role:updated");
  });

  socket.on("game-role:alive", (input: unknown) => {
    if (!isAdmin(socket.id)) return;
    if (!input || typeof input !== "object") return;
    const { playerId, isAlive } = input as { playerId?: unknown; isAlive?: unknown };
    if (typeof playerId !== "string" || typeof isAlive !== "boolean") return;
    const target = participant(playerId);
    if (!target || target.userRole !== "player") return;
    aliveByAccount.set(accountKey(target.name), isAlive);
    updatePlayer(target.id, { isAlive });
    if (!isAlive) dayVotes.removeAccount(accountKey(target.name));
    broadcastPlayers();
    broadcastControllerPhaseStatus();
    sendRoleProgress();
    socket.emit("game-role:updated");
  });

  socket.on("scene:viewer-settings:request", () => {
    const viewer = participant(socket.id);
    if (viewer) sendSceneSettingsTo(viewer);
  });
  socket.on("scene:settings:request", () => {
    if (!isAdmin(socket.id)) return;
    const viewer = participant(socket.id);
    if (viewer) sendSceneSettingsTo(viewer);
  });
  socket.on("game:result:request", () => {
    const receiver = participant(socket.id);
    if (receiver) sendGameResultTo(receiver);
  });
  socket.on("game:settings:request", () => {
    if (!isAdmin(socket.id)) return;
    socket.emit("game:admin-settings", { ...gameEndSettings });
  });
  socket.on("game:settings:update", (input: unknown) => {
    if (!isAdmin(socket.id) || !input || typeof input !== "object" || Array.isArray(input)) return;
    const value = input as Record<string, unknown>;
    if (Object.keys(value).length !== 1 || typeof value.winDetectionEnabled !== "boolean") return;
    gameEndSettings.winDetectionEnabled = value.winDetectionEnabled;
    for (const receiver of players) sendGameResultTo(receiver);
    scheduleAutomaticRestart();
  });

  socket.on("scene:settings:update", (input: unknown) => {
    if (!isAdmin(socket.id)) return;
    if (!input || typeof input !== "object" || Array.isArray(input)) return;
    const data = input as Record<string, unknown>;
    const keys = Object.keys(data);
    if (keys.length !== 1 ||
        !["gmRoleFramesPermanent", "blockNightOutsideOwnPhase"].includes(keys[0]) ||
        typeof data[keys[0]] !== "boolean") return;
    if (keys[0] === "gmRoleFramesPermanent") sceneSettings.gmRoleFramesPermanent = data[keys[0]] as boolean;
    else sceneSettings.blockNightOutsideOwnPhase = data[keys[0]] as boolean;
    syncSceneSettings();
  });

  // Spielphasen

  socket.on("phase:set", (nextPhase: unknown) => {
    if (!isAdmin(socket.id)) {
      socket.emit("phase:error", "Nur der Gamemaster darf die Phase direkt setzen.");
      return;
    }
    const validPhases: GamePhase[] = ["lobby", "preparation", "night", "day", "finished"];
    if (typeof nextPhase !== "string" || !validPhases.includes(nextPhase as GamePhase)) {
      socket.emit("phase:error", "Ungueltige Spielphase.");
      return;
    }
    setGamePhase(nextPhase as GamePhase);
  });

  socket.on("phase:control:request", () => {
    const controller = participant(socket.id);
    if (controller?.userRole !== "storyteller" && controller?.userRole !== "gamemaster") return;
    sendControllerPhaseStatus(socket.id);
    sendRoleProgress();
  });

  socket.on("phase:advance", () => {
    const controller = participant(socket.id);
    if (controller?.userRole !== "gamemaster" && controller?.userRole !== "storyteller") return;

    const phase = phaseManager.currentPhase;
    if (phase === "lobby") return setGamePhase("preparation");
    if (phase === "preparation") return setGamePhase("night");
    if (phase === "night") {
      completeCurrentRoleStep();
      const next = phaseManager.nextStep();
      roleManager.resetConfirmations();
      if (next.step === null) {
        setGamePhase("day");
        return;
      }
      broadcastControllerPhaseStatus();
      syncSceneSettings();
      sendRoleProgress();
      syncRoleStates();
      return;
    }
    if (phase === "day") {
      if (dayVotes.currentState === "idle") {
        dayVotes.start();
        syncDayVotes();
      } else if (dayVotes.currentState === "open") {
        closeAndRevealDayVote();
      } else if (dayVotes.currentState === "closed") {
        setGamePhase("night");
      }
    }
  });

  socket.on("phase:step:next", () => {
    const controller = participant(socket.id);
    if (controller?.userRole !== "gamemaster" && controller?.userRole !== "storyteller") return;
    completeCurrentRoleStep();
    phaseManager.nextStep();
    roleManager.resetConfirmations();
    broadcastControllerPhaseStatus();
    syncSceneSettings();
    sendRoleProgress();
    syncRoleStates();
  });

  // Eigene Rollenaktion abrufen.
  socket.on("role:state:request", () => {
    const actor = participant(socket.id);
    if (actor) sendRoleState(actor);
  });

  // Einheitliche Auswahl für alle Rollen.
  socket.on("role:select", (targetId: unknown) => {
    const actor = participant(socket.id);
    const phase = currentRoleActionPhase();
    if (!actor || !phase || typeof targetId !== "string" || targetId.length > 128) return;
    const target = participant(targetId);
    if (!target) return;

    const result = roleManager.select(
      roleActionPlayer(actor),
      roleActionPlayer(target),
      phase,
    );
    if (!result.ok) {
      socket.emit("role:error", result.reason);
      return;
    }

    const ownSelection = actor.gameRole
      ? roleManager.getRole(actor.gameRole)?.actions.getSelection?.(accountKey(actor.name)) ?? null
      : null;
    const targetOnline = ownSelection === null ? null : players.find(p =>
      p.userRole === "player" && accountKey(p.name) === ownSelection
    );
    socket.emit("role:selection", { targetId: targetOnline?.id ?? null });
    sendRoleState(actor);
  });

  // Auswahl sperren und Fortschritt nur an Spielleitung senden.
  socket.on("role:confirm", () => {
    const actor = participant(socket.id);
    const phase = currentRoleActionPhase();
    if (!actor || !phase) return;

    const result = roleManager.confirm(roleActionPlayer(actor), phase);
    if (!result.ok) {
      socket.emit("role:error", result.reason);
      return;
    }

    socket.emit("role:confirmed");
    sendRoleState(actor);
    sendRoleProgress();
  });

  // Zentraler Rollenbutton
  socket.on("role:action", (buttonId: unknown) => {
    const actor = participant(socket.id);
    const phase = currentRoleActionPhase();
    if (!actor || !phase || typeof buttonId !== "string" || buttonId.length > 64) return;
    const result = roleManager.triggerButton(roleActionPlayer(actor), phase, buttonId, nightState);
    if (!result.ok) {
      socket.emit("role:error", result.reason);
      return;
    }
    if (result.effects?.length) {
      if (phase.period === "night") nightState.record(result.effects);
      else applyRoleEffects(result.effects);
    }
    if (phase.period === "day") syncDayVotes();
    socket.emit("role:action:success", { buttonId });
    sendRoleState(actor);
    sendRoleProgress();
  });

  // Dorfabstimmung
  socket.on("day-vote:request", () => {
    if (!participant(socket.id)) return;
    syncDayVotes();
  });

  socket.on("day-vote:start", () => {
    const actor = participant(socket.id);
    if (!actor || (actor.userRole !== "storyteller" && actor.userRole !== "gamemaster")) return;
    if (phaseManager.currentPhase !== "day") {
      socket.emit("day-vote:error", "Eine Abstimmung ist nur am Tag moeglich.");
      return;
    }
    if (dayVotes.currentState !== "idle") return;
    dayVotes.start();
    syncDayVotes();
  });

  socket.on("day-vote:cast", (targetId: unknown) => {
    const voter = participant(socket.id);
    if (!voter || voter.userRole !== "player" || !voter.isAlive ||
        phaseManager.currentPhase !== "day" || dayVotes.currentState !== "open") {
      socket.emit("day-vote:error", "Du darfst gerade nicht abstimmen.");
      return;
    }
    if (typeof targetId !== "string" || targetId.length > 128) return;
    const target = participant(targetId);
    if (!target || target.userRole !== "player" || !target.isAlive) {
      socket.emit("day-vote:error", "Dieses Ziel ist nicht waehlbar.");
      return;
    }
    dayVotes.cast(accountKey(voter.name), accountKey(target.name));
    syncDayVotes();
  });

  socket.on("day-vote:close", () => {
    const actor = participant(socket.id);
    if (!actor || (actor.userRole !== "storyteller" && actor.userRole !== "gamemaster")) return;
    closeAndRevealDayVote();
  });

  socket.on("day-vote:repeat", () => {
    const actor = participant(socket.id);
    if (!actor || (actor.userRole !== "storyteller" && actor.userRole !== "gamemaster")) return;
    if (phaseManager.currentPhase !== "day" || !dayVotes.repeat(playerAccounts)) return;
    syncDayVotes();
  });

  socket.on("day-vote:apply", () => {
    if (participant(socket.id)?.userRole === "gamemaster" ||
        participant(socket.id)?.userRole === "storyteller") {
      socket.emit("day-vote:error", "Das Ergebnis wird bereits beim Schliessen uebernommen.");
    }
  });

  // Kamerafreigaben

  socket.on("camera:ready", () => {
    const user = participant(socket.id);
    if (!user || user.userRole === "gamemaster") return;
    if (cameraEntries.get(socket.id)?.status === "blocked") {
      socket.emit("camera:error", "Kamera nach PANIC gesperrt. Gamemaster muss die erneute Einrichtung erlauben.");
      return;
    }
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


  // Verbindung trennen
  socket.on("disconnect", () => {
    const disconnectedUser = participant(socket.id);
    if (disconnectedUser?.userRole === "gamemaster") {
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
    broadcastPlayers();
  });
});

const PORT = Number(process.env.PORT) || 3000;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Werwolf Engine Server läuft auf Port ${PORT}`);
});
