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
import { decideWinCondition, type WinDecision, type WinCheckpoint } from "./game/WinConditionManager";
import { RelationshipManager } from "./game/RelationshipManager";
import { GameAnimationManager } from "./game/GameAnimationManager";
import { GameSoundManager } from "./game/GameSoundManager";
import { werewolfVotes } from "./roles/werewolf/actions";

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
let pendingNightEffects: RoleEffect[] | null = null;
let dayIntroPending = false;
let dayDeathsRevealed = false;
let nightCasualtyKeys: string[] = [];
let heldDeathKeys: string[] = [];
let nightCasualties: string[] = [];
const relationships = new RelationshipManager();
const gameAnimations = new GameAnimationManager((id, event) => io.to(id).emit("animation:play", event));
const gameSounds = new GameSoundManager((id, event) => io.to(id).emit("sound:play", event));
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

function applyRelationshipLinks(effects: readonly RoleEffect[]): void {
  let changed = false;
  const members = new Set(roundRolePlayers().filter(p => p.isAlive).map(p => p.id));
  for (const effect of effects) {
    if (effect.type !== "link-lovers") continue;
    const [first, second] = effect.targetIds;
    if (members.has(first) && members.has(second)) {
      changed = relationships.setLovers(first, second) || changed;
    }
  }
  if (changed) {
    syncLoverStates();
    const pair = relationships.getLovers();
    if (pair) {
      const participantSocket = (key: string) => players.find(p =>
        p.userRole === "player" && accountKey(p.name) === key)?.id;
      const cupids = roundRolePlayers().filter(p => p.gameRole === "cupid" && p.isAlive);
      const source = cupids.length === 1 ? cupids[0] : undefined;
      const targets = pair.map(participantSocket).filter((id): id is string => Boolean(id));
      const isCupid = (p: Player) => source !== undefined &&
        p.userRole === "player" && accountKey(p.name) === source.id;
      const controllers = players.filter(p => isController(p) || isCupid(p));
      const lovers = players.filter(p => p.userRole === "player" &&
        pair.includes(accountKey(p.name)) && !isCupid(p));
      gameAnimations.play("cupid-arrow", targets, controllers.map(p => p.id),
        source ? participantSocket(source.id) : undefined);
      gameAnimations.play("cupid-arrow", targets, lovers.map(p => p.id));
    }
  }
}

function applyRoleEffects(effects: readonly RoleEffect[]): void {
  applyRelationshipLinks(effects);
  const roundPlayers = roundRolePlayers();
  const resolved = resolveRoleEffects(effects, roundPlayers);
  const casualties = relationships.cascadeDeaths(resolved.eliminated, roundPlayers);
  const deathTargets = casualties.filter(death => roundPlayers.some(p =>
    p.id === death.targetId && p.isAlive)).map(death =>
    players.find(p => p.userRole === "player" && accountKey(p.name) === death.targetId)?.id,
  ).filter((id): id is string => Boolean(id));
  gameAnimations.play("player-death", deathTargets, players.map(p => p.id));
  let eliminated = false;

  for (const { targetId, reason } of casualties) {
    const target = roundPlayers.find(p => p.id === targetId && p.isAlive);
    if (!target) continue;
    aliveByAccount.set(target.id, false);
    dayVotes.removeAccount(target.id);
    const online = players.find(p => p.userRole === "player" && accountKey(p.name) === target.id);
    if (online) updatePlayer(online.id, { isAlive: false });
    else roleManager.notifyDeath(target);
    eliminated = true;
    for (const receiver of players) {
      io.to(receiver.id).emit("role:eliminated", {
        playerId: online?.id ?? null,
        name: playerAccounts.get(target.id)?.name ?? "Spieler",
        reason,
      });
      if (reason === "day-vote" || reason === "lovers") {
        io.to(receiver.id).emit("day-vote:eliminated", { playerId: online?.id ?? null, reason });
      }
    }
  }

  for (const targetId of resolved.revealed) {
    const roleId = gameRolesByAccount.get(targetId) ?? null;
    roleManager.publishFrameOnReveal(targetId, roleId);
    const targetSocketId = players.find(p => p.userRole === "player" && accountKey(p.name) === targetId)?.id;
    // Später: gameAnimations.play("captain-reveal", targetSocketId ? [targetSocketId] : [], players.map(p => p.id));
    const roleName = roleId ? roleManager.getRole(roleId)?.config.name ?? roleId : "Dorfbewohner";
    for (const receiver of players) {
      io.to(receiver.id).emit("role:revealed", {
        playerId: targetSocketId ?? null,
        name: playerAccounts.get(targetId)?.name ?? "Spieler",
        roleId,
        roleName,
      });
    }
  }
  if (resolved.revealed.length) syncVisibleRoleFrames();
  if (eliminated) broadcastPlayers();
}

function completeCurrentRoleStep(): void {
  const phase = currentRoleActionPhase();
  if (!phase || phase.stepId === "night-closing") return;
  const participants = roundRolePlayers();
  roleManager.completeStep(phase, participants);
  if (phase.period === "night" && phase.stepId !== null) {
    nightState.completeStep(phase.stepId, () => {
      const effects = roleManager.runNightStepEnd(phase, participants, nightState);
      applyRelationshipLinks(effects);
      return effects;
    });
  }
}

function finishNight(): void {
  const phase = currentRoleActionPhase();
  if (!phase || phase.period !== "night") return;
  completeCurrentRoleStep();
  nightState.record(roleManager.runEvent("onNightEnd", roundRolePlayers(), phase.round, nightState));
  pendingNightEffects = [...nightState.getEffects()];
  const participants = roundRolePlayers();
  const resolved = resolveRoleEffects(pendingNightEffects, participants);
  nightCasualtyKeys = relationships.cascadeDeaths(resolved.eliminated, participants)
    .filter(death => participants.some(p => p.id === death.targetId && p.isAlive))
    .map(death => death.targetId);
  nightCasualties = nightCasualtyKeys.map(key => playerAccounts.get(key)?.name ?? "Spieler");
  nightState.reset();
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
    selectedTargetIds: [] as string[],
    targetIds: [] as string[], buttons: [] as { id: string; label: string; disabled: boolean }[],
    nightInfo: null as { werewolfTargetId: string | null } | null,
  };
  const phase = currentRoleActionPhase();
  if (receiver.userRole !== "player" || !phase || dayIntroPending) {
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
    hasSelection: action.selectionIds.length > 0,
    selectedTargetId: action.selectionId ? socketIdForAccount(action.selectionId) : null,
    selectedTargetIds: action.selectionIds.map(socketIdForAccount)
      .filter((id): id is string => id !== null),
    targetIds: action.allowedTargetIds
      .map(socketIdForAccount)
      .filter((id): id is string => id !== null),
  });
}

function syncRoleStates(): void {
  for (const player of players) sendRoleState(player);
  syncWerewolfVotes();
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

function sendDeathDisplayTo(receiver: Player): void {
  const ids = heldDeathKeys.map(key => players.find(player =>
    player.userRole === "player" && accountKey(player.name) === key)?.id,
  ).filter((id): id is string => Boolean(id));
  io.to(receiver.id).emit("day:death-display", { targetPlayerIds: ids });
}

function syncDeathDisplay(): void {
  for (const receiver of players) sendDeathDisplayTo(receiver);
}

function controllerPhaseStatus() {
  return {
    ...phaseManager.getStatus(),
    dayIntroPending,
    dayDeathsRevealed,
    nightCasualties: phaseManager.currentPhase === "day" ? nightCasualties : [],
    nightSteps: phaseManager.getNightTimeline(
      roundParticipantKeys.size ? roundRolePlayers() : players,
    ).map((entry) => ({
      id: entry.id,
      label: entry.id === "lovers-awake" ? "Verliebte erwachen" :
        entry.id === "night-closing" ? "Nacht klingt aus" :
        entry.id === "werewolves" ? "Werwölfe" :
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
const gameEndSettings = { winDetectionEnabled: true };

function sendGameResultTo(receiver: Player): void {
  io.to(receiver.id).emit("game:result", gameResult === null ? null : {
    ...gameResult,
    autoRestartOnWin: false,
  });
  if (receiver.userRole === "gamemaster") {
    io.to(receiver.id).emit("game:admin-settings", { ...gameEndSettings });
  }
}

function broadcastGameResult(): void {
  for (const receiver of players) sendGameResultTo(receiver);
}

/** Nur nach einer wirksamen Elimination am Tag oder nach Ende der Nacht. */
function finishIfWinner(checkpoint: WinCheckpoint): boolean {
  if (!gameEndSettings.winDetectionEnabled || gameResult || !startedWithWerewolves || roundParticipantKeys.size === 0) return false;
  const participants = [...roundParticipantKeys]
    .filter(key => playerAccounts.has(key))
    .map(key => ({
      id: key,
      roleId: gameRolesByAccount.get(key) ?? null,
      isAlive: aliveByAccount.get(key) ?? true,
    }));
  const lovers = relationships.getLovers();
  const decision = decideWinCondition(participants, checkpoint, lovers, {
    getTeam: roleId => roleManager.getTeam(roleId),
    specialWins: roleManager.getCustomWinCandidates(participants, checkpoint, lovers),
  });
  if (!decision) return false;
  gameResult = decision;
  setGamePhase("finished");
  broadcastGameResult();
  return true;
}

const sceneSettings = {
  hideControllerRoleFramesDuringDay: false,
  blockNightOutsideOwnPhase: true,
};

function sendSceneSettingsTo(viewer: Player): void {
  const isNight = phaseManager.currentPhase === "night";
  const loversAwake = isNight && phaseManager.getStatus().step === "lovers-awake";
  const partnerKey = viewer.userRole === "player"
    ? relationships.getPartner(accountKey(viewer.name)) : null;
  const partner = partnerKey ? players.find(player =>
    player.userRole === "player" && accountKey(player.name) === partnerKey) : null;
  const canSeeNightCameras = viewer.userRole !== "player" || (
    viewer.isAlive && viewer.gameRole !== null && phaseManager.getActiveRoleIds().includes(viewer.gameRole)
  );
  io.to(viewer.id).emit("scene:viewer-settings", {
    revealGamemasterRoles: isController(viewer) &&
      !(sceneSettings.hideControllerRoleFramesDuringDay && phaseManager.currentPhase === "day"),
    maskNightCameras: loversAwake && viewer.userRole === "player"
      ? true : isNight && sceneSettings.blockNightOutsideOwnPhase && !canSeeNightCameras,
    nightVisiblePlayerIds: loversAwake && partner
      ? [partner.id, ...players.filter(p => p.userRole === "storyteller").map(p => p.id)]
      : [],
  });
  if (viewer.userRole === "gamemaster") {
    io.to(viewer.id).emit("scene:admin-settings", { ...sceneSettings });
  }
}

function sendCameraLayoutTo(viewer: Player): void {
  const focusedPlayerIds: string[] = [];
  if (phaseManager.currentPhase === "night" && phaseManager.getStatus().step === "lovers-awake") {
    const pair = relationships.getLovers();
    const visible = pair && (
      viewer.userRole === "gamemaster" || viewer.userRole === "storyteller" ||
      (viewer.userRole === "player" && pair.includes(accountKey(viewer.name))));
    if (pair && visible) {
      for (const target of players) {
        if ((target.userRole === "player" && pair.includes(accountKey(target.name))) ||
            target.userRole === "storyteller") {
          focusedPlayerIds.push(target.id);
        }
      }
    }
    io.to(viewer.id).emit("scene:camera-layout", { focusedPlayerIds });
    return;
  }
  if (phaseManager.currentPhase === "night") {
    const activeRoles = phaseManager.getActiveRoleIds();
    const controller = viewer.userRole === "gamemaster" || viewer.userRole === "storyteller";
    const canFocusOwnRole = viewer.userRole === "player" && viewer.isAlive &&
      viewer.gameRole !== null && activeRoles.includes(viewer.gameRole);
    if (controller || canFocusOwnRole) {
      for (const target of players) {
        if (target.userRole !== "player" || !target.gameRole ||
            !activeRoles.includes(target.gameRole)) continue;
        const config = roleManager.getRole(target.gameRole)?.config;
        const nightLayout = config?.cameraLayout?.night?.active;
        if (nightLayout && "enabled" in nightLayout && !nightLayout.enabled) continue;
        if (controller || target.id === viewer.id ||
            (viewer.gameRole === target.gameRole &&
             nightLayout?.target === "same-role" && config?.frameVisibility?.sameRole)) {
          focusedPlayerIds.push(target.id);
        }
      }
    }
  }
  io.to(viewer.id).emit("scene:camera-layout", { focusedPlayerIds });
}

function syncSceneSettings(): void {
  for (const viewer of players) {
    sendSceneSettingsTo(viewer);
    sendCameraLayoutTo(viewer);
  }
  syncVisibleRoleFrames();
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

function sendRoleNotebookTo(receiver: Player): void {
  const inRound = roundParticipantKeys.size > 0 &&
    (phaseManager.currentPhase === "role-intro" ||
     phaseManager.currentPhase === "night" ||
     phaseManager.currentPhase === "day" ||
     phaseManager.currentPhase === "finished");
  const roles = inRound
    ? roleManager.getNotebookEntries(roundRolePlayers().map(player => player.gameRole),
        receiver.userRole === "player" ? receiver.gameRole : null,
        receiver.userRole !== "player")
    : [];
  io.to(receiver.id).emit("role:notebook", roles);
}

function syncRoleNotebooks(): void {
  for (const receiver of players) sendRoleNotebookTo(receiver);
}

function sendVisibleRoleFramesTo(receiver: Player): void {
  const viewer = receiver.userRole === "player" ? roleActionPlayer(receiver) : null;
  const controllerVisible = phaseManager.currentPhase === "finished" ||
    (isController(receiver) &&
      !(sceneSettings.hideControllerRoleFramesDuringDay && phaseManager.currentPhase === "day"));
  const visible: Record<string, string> = {};
  for (const target of players) {
    if (target.userRole !== "player") continue;
    const frame = controllerVisible
      ? roleManager.getFrameFilename(target.gameRole)
      : roleManager.getVisibleFrame(viewer, roleActionPlayer(target));
    if (frame) visible[target.id] = frame;
  }
  io.to(receiver.id).emit("game-role:frames", visible);
}

function syncVisibleRoleFrames(): void {
  for (const receiver of players) sendVisibleRoleFramesTo(receiver);
}

function sendLoverStateTo(receiver: Player): void {
  const canSee = phaseManager.currentPhase === "finished" || receiver.userRole !== "player" ||
    (roundParticipantKeys.has(accountKey(receiver.name)) &&
      (receiver.gameRole === "cupid" || relationships.getPartner(accountKey(receiver.name)) !== null));
  const keys = canSee ? relationships.getLovers() ?? [] : [];
  const markedPlayerIds = keys.map(key =>
    players.find(p => p.userRole === "player" && accountKey(p.name) === key)?.id,
  ).filter((id): id is string => Boolean(id));
  const partnerKey = receiver.userRole === "player"
    ? relationships.getPartner(accountKey(receiver.name)) : null;
  io.to(receiver.id).emit("lovers:state", {
    markedPlayerIds,
    partnerName: partnerKey ? playerAccounts.get(partnerKey)?.name ?? null : null,
  });
}

function syncLoverStates(): void {
  for (const receiver of players) sendLoverStateTo(receiver);
}

function sendWerewolfVotesTo(receiver: Player): void {
  const wolfPhase = phaseManager.currentPhase === "night" &&
    phaseManager.getActiveRoleIds().some(id => roleManager.isInNightGroup(id, "werewolves"));
  const permitted = receiver.userRole !== "player" ||
    (receiver.userRole === "player" && receiver.isAlive &&
      roundParticipantKeys.has(accountKey(receiver.name)) &&
      roleManager.isInNightGroup(receiver.gameRole, "werewolves"));
  const entries = wolfPhase && permitted ? werewolfVotes.getEntries().flatMap(([voterId, targetKey]) => {
    if (!roundParticipantKeys.has(voterId) || !roundParticipantKeys.has(targetKey) ||
        aliveByAccount.get(voterId) === false) return [];
    const targetId = players.find(p => p.userRole === "player" && accountKey(p.name) === targetKey)?.id;
    return targetId ? [{ targetId, confirmed: roleManager.isConfirmed(voterId) }] : [];
  }) : [];
  io.to(receiver.id).emit("werewolf-vote:status", { entries });
}

function syncWerewolfVotes(): void {
  for (const receiver of players) sendWerewolfVotesTo(receiver);
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
    const teammates = receiver.userRole === "player" &&
      roleManager.isInNightGroup(receiver.gameRole, "werewolves")
      ? players.filter((p) => p.userRole === "player" &&
          roleManager.isInNightGroup(p.gameRole, "werewolves") && p.id !== receiver.id)
          .map((p) => ({ id: p.id, name: p.name }))
      : [];
    io.to(receiver.id).emit("game-role:teammates", teammates);
  }
  syncVisibleRoleFrames();
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
    applyRoleEffects([{ type: "eliminate", targetId: winnerKey, reason: "day-vote" }]);
  }
  syncDayVotes();
  finishIfWinner("day-vote");
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
  syncLoverStates();
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
  if (previousPhase === "finished" && nextPhase === "preparation") {
    phaseManager.resetRound();
    roleManager.resetGame();
    nightState.reset();
    dayVotes.reset();
    relationships.reset();
    gameRolesByAccount.clear();
    aliveByAccount.clear();
    roundParticipantKeys.clear();
    startedWithWerewolves = false;
    gameResult = null;
    for (const player of players) {
      if (player.userRole !== "player") continue;
      player.gameRole = null;
      player.isAlive = true;
    }
    broadcastPlayers();
    syncGameRoles();
    syncLoverStates();
    syncWerewolfVotes();
    broadcastGameResult();
  }
  if (previousPhase === "preparation" && nextPhase === "night") {
    for (const controller of players.filter(isController)) {
      io.to(controller.id).emit("phase:error", "Zuerst die Rollen kennenlernen.");
    }
    return;
  }
  if (previousPhase === "day" && dayIntroPending && nextPhase === "night") {
    for (const controller of players.filter(isController)) {
      io.to(controller.id).emit("phase:error", "Zuerst die Nacht-Todesfälle bekanntgeben.");
    }
    return;
  }
  if (previousPhase === "night" && nextPhase === "day") finishNight();
  if (previousPhase !== "day" && nextPhase !== "day") {
    pendingNightEffects = null;
    dayIntroPending = false;
    dayDeathsRevealed = false;
    heldDeathKeys = [];
    nightCasualtyKeys = [];
    nightCasualties = [];
    syncDeathDisplay();
  }
  if (nextPhase === "role-intro" &&
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
    if (dayVotes.currentState === "closed" && finishIfWinner("day-vote")) return;
  }
  if (nextPhase === "lobby") {
    nightState.reset();
    gameResult = null;
    roundParticipantKeys.clear();
    relationships.reset();
    syncLoverStates();
    startedWithWerewolves = false;
  }
  if (nextPhase === "role-intro" &&
      (previousPhase === "lobby" || previousPhase === "preparation") &&
      phaseManager.getStatus().round === 0) {
    roundParticipantKeys.clear();
    for (const p of players) {
      if (p.userRole === "player") roundParticipantKeys.add(accountKey(p.name));
    }
    startedWithWerewolves = [...roundParticipantKeys].some(
      key => roleManager.getTeam(gameRolesByAccount.get(key) ?? null) === "werewolves",
    );
  }
  const status = phaseManager.setPhase(nextPhase,
    roundParticipantKeys.size ? roundRolePlayers() : players);
  if (previousPhase !== status.phase) {
    dayIntroPending = status.phase === "day" && pendingNightEffects !== null;
    dayDeathsRevealed = false;
    if (status.phase !== "day") {
      pendingNightEffects = null;
      nightCasualtyKeys = [];
      heldDeathKeys = [];
      nightCasualties = [];
      syncDeathDisplay();
    }
    if (status.phase === "lobby") {
      roleManager.resetGame();
    } else if (status.phase === "night") {
      nightState.reset();
      roleManager.resetRoleActions();
    } else {
      roleManager.resetConfirmations();
    }
    if (status.phase === "finished" || status.phase === "preparation" || status.phase === "role-intro") nightState.reset();
    if (status.phase !== "finished") dayVotes.reset();
    if (status.phase === "night") {
      nightState.record(roleManager.runEvent("onNightStart", roundRolePlayers(), status.round, nightState));
    }
    if (status.phase === "day" && !dayIntroPending) {
      applyRoleEffects(roleManager.runEvent("onDayStart", roundRolePlayers(), status.round));
      if (finishIfWinner("night-end")) return;
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
  if (status.phase === "finished") syncLoverStates();
  syncRoleNotebooks();
  for (const recipient of players) io.to(recipient.id).emit("phaseChanged", status.phase);
  broadcastControllerPhaseStatus();
  sendRoleProgress();
  syncRoleStates();
}


function revealNightCasualties(): void {
  if (phaseManager.currentPhase !== "day" || !dayIntroPending || dayDeathsRevealed) return;
  dayDeathsRevealed = true;
  heldDeathKeys = [...nightCasualtyKeys];
  syncDeathDisplay();
  const effects = pendingNightEffects ?? [];
  pendingNightEffects = null;
  applyRoleEffects(effects);
  broadcastControllerPhaseStatus();
}

function placeNightCasualties(): void {
  if (phaseManager.currentPhase !== "day" || !dayIntroPending || !dayDeathsRevealed) return;
  heldDeathKeys = [];
  syncDeathDisplay();
  dayIntroPending = false;
  dayDeathsRevealed = false;
  applyRoleEffects(roleManager.runEvent("onDayStart", roundRolePlayers(), phaseManager.getStatus().round));
  phaseManager.syncDaySteps(roundRolePlayers());
  if (finishIfWinner("night-end")) return;
  broadcastControllerPhaseStatus();
  syncRoleStates();
  syncSceneSettings();
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
    sendDeathDisplayTo(admin);
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
    sendDeathDisplayTo(newPlayer);
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

  socket.on("role:notebook:request", () => {
    const receiver = participant(socket.id);
    if (receiver) sendRoleNotebookTo(receiver);
  });

  socket.on("scene:camera-layout:request", () => {
    const viewer = participant(socket.id);
    if (viewer) sendCameraLayoutTo(viewer);
  });

  socket.on("game-role:frames:request", () => {
    const viewer = participant(socket.id);
    if (viewer) sendVisibleRoleFramesTo(viewer);
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
    if (!isAlive && roundParticipantKeys.has(accountKey(target.name))) {
      applyRoleEffects([{ type: "eliminate", targetId: accountKey(target.name), reason: "admin" }]);
    } else {
      aliveByAccount.set(accountKey(target.name), isAlive);
      updatePlayer(target.id, { isAlive });
    }
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
  });

  socket.on("scene:settings:update", (input: unknown) => {
    if (!isAdmin(socket.id)) return;
    if (!input || typeof input !== "object" || Array.isArray(input)) return;
    const data = input as Record<string, unknown>;
    const keys = Object.keys(data);
    if (keys.length !== 1 ||
        !["hideControllerRoleFramesDuringDay", "blockNightOutsideOwnPhase"].includes(keys[0]) ||
        typeof data[keys[0]] !== "boolean") return;
    if (keys[0] === "hideControllerRoleFramesDuringDay") sceneSettings.hideControllerRoleFramesDuringDay = data[keys[0]] as boolean;
    else sceneSettings.blockNightOutsideOwnPhase = data[keys[0]] as boolean;
    syncSceneSettings();
  });

  // Spielphasen

  socket.on("phase:set", (nextPhase: unknown) => {
    if (!isAdmin(socket.id)) {
      socket.emit("phase:error", "Nur der Gamemaster darf die Phase direkt setzen.");
      return;
    }
    const validPhases: GamePhase[] = ["lobby", "preparation", "role-intro", "night", "day", "finished"];
    if (typeof nextPhase !== "string" || !validPhases.includes(nextPhase as GamePhase)) {
      socket.emit("phase:error", "Ungueltige Spielphase.");
      return;
    }
    setGamePhase(nextPhase as GamePhase);
  });

  socket.on("day:death-display:request", () => {
    const receiver = participant(socket.id);
    if (receiver) sendDeathDisplayTo(receiver);
  });

  socket.on("sound:test", () => {
    if (!isAdmin(socket.id)) return;
    gameSounds.play("test", players.map(player => player.id));
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
    if (phase === "finished") return setGamePhase("preparation");
    if (phase === "lobby") return setGamePhase("preparation");
    if (phase === "preparation") return setGamePhase("role-intro");
    if (phase === "role-intro") return setGamePhase("night");
    if (phase === "night") {
      if (phaseManager.getStatus().step === "night-closing") return setGamePhase("day");
      completeCurrentRoleStep();
      const next = phaseManager.nextStep();
      roleManager.resetConfirmations();
      if (next.step === "lovers-awake") {
        const pair = relationships.getLovers();
        if (pair) {
          const recipients = players.filter(player => player.userRole === "player" &&
            pair.includes(accountKey(player.name))).map(player => player.id);
          gameSounds.play("love", recipients);
        }
      }
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
      if (dayIntroPending) return dayDeathsRevealed ? placeNightCasualties() : revealNightCasualties();
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
    if (dayIntroPending) return;
    if (phaseManager.currentPhase === "night" && phaseManager.getStatus().step === "night-closing") {
      setGamePhase("day");
      return;
    }
    completeCurrentRoleStep();
    phaseManager.nextStep();
    roleManager.resetConfirmations();
    broadcastControllerPhaseStatus();
    syncSceneSettings();
    sendRoleProgress();
    syncRoleStates();
  });

  socket.on("lovers:state:request", () => {
    const receiver = participant(socket.id);
    if (receiver) sendLoverStateTo(receiver);
  });

  socket.on("werewolf-vote:request", () => {
    const receiver = participant(socket.id);
    if (receiver) sendWerewolfVotesTo(receiver);
  });

  // Eigene Rollenaktion abrufen.
  socket.on("role:state:request", () => {
    const actor = participant(socket.id);
    if (actor) sendRoleState(actor);
  });
  socket.on("role:progress:request", () => {
    if (isController(participant(socket.id))) sendRoleProgress();
  });

  // Einheitliche Auswahl für alle Rollen.
  socket.on("role:select", (targetId: unknown) => {
    const actor = participant(socket.id);
    const phase = currentRoleActionPhase();
    if (!actor || !phase || dayIntroPending || typeof targetId !== "string" || targetId.length > 128) return;
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
    syncWerewolfVotes();
  });

  // Bestätigte Effekte verarbeiten
  function handleConfirmationEffects(effects: readonly RoleEffect[], phase: RoleActionPhase): void {
    if (phase.period === "night") {
      applyRelationshipLinks(effects);
      nightState.record(effects.filter(effect => effect.type !== "link-lovers"));
    } else {
      applyRoleEffects(effects);
    }
  }

  // Auswahl sperren und Fortschritt nur an Spielleitung senden.
  socket.on("role:confirm", () => {
    const actor = participant(socket.id);
    const phase = currentRoleActionPhase();
    if (!actor || !phase || dayIntroPending) return;

    const result = roleManager.confirm(roleActionPlayer(actor), phase);
    if (!result.ok) {
      socket.emit("role:error", result.reason);
      return;
    }

    if (result.effects?.length) handleConfirmationEffects(result.effects, phase);
    socket.emit("role:confirmed");
    sendRoleState(actor);
    sendRoleProgress();
    syncWerewolfVotes();
  });

  // Zentraler Rollenbutton
  socket.on("role:action", (buttonId: unknown) => {
    const actor = participant(socket.id);
    const phase = currentRoleActionPhase();
    if (!actor || !phase || dayIntroPending || typeof buttonId !== "string" || buttonId.length > 64) return;
    const result = roleManager.triggerButton(roleActionPlayer(actor), phase, buttonId, nightState);
    if (!result.ok) {
      socket.emit("role:error", result.reason);
      return;
    }
    if (result.effects?.length) {
      if (phase.period === "night" && roleManager.getRole(actor.gameRole ?? "")?.config.buttons?.night
        ?.some(button => button.id === buttonId && button.kind === "confirm")) {
        handleConfirmationEffects(result.effects, phase);
      } else if (phase.period === "night") nightState.record(result.effects);
      else applyRoleEffects(result.effects);
    }
    if (phase.period === "day") syncDayVotes();
    socket.emit("role:action:success", { buttonId });
    sendRoleState(actor);
    sendRoleProgress();
    syncWerewolfVotes();
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
    if (dayIntroPending || dayVotes.currentState !== "idle") return;
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
