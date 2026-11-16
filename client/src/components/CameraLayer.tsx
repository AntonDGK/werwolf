import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PublicPlayer } from "../types/Player";
import { useCamera } from "../camera/useCamera";
import { socket } from "../socket";
import CameraFrame from "./CameraFrame";
import { calculateCameraEllipse, calculateFocusTargets, CAMERA_ELLIPSE } from "../layout/CameraEllipseLayout";
import CameraMotionSlot from "../layout/CameraMotionSlot";
import { reportCameraSize } from "../layout/cameraSizeNotice";
import villageVoteIcon from "../assets/icons/vote-villager.png";
import werewolfVoteIcon from "../assets/icons/vote-werewolf.png";

const iconFiles = import.meta.glob("../assets/icons/*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const loverIcon = iconFiles["../assets/icons/heart-amor.png"] ?? null;
import "./CameraLayer.css";
import "./CameraLayerNight.css";

function CameraVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => {});
    return () => { video.srcObject = null; };
  }, [stream]);
  return <video ref={ref} autoPlay muted playsInline className="camera-layer__video" />;
}

type VoteView = {
  state: "idle" | "open" | "closed" | "resolved";
  myVote: string | null;
  results: { target: string; votes: number }[];
} | null;
type RoleActionView = {
  active: boolean;
  confirmed: boolean;
  selectedTargetId: string | null;
  selectedTargetIds?: string[];
  targetIds: string[];
};

type Props = {
  players: PublicPlayer[];
  roleAction?: RoleActionView | null;
  visibleFrames?: Record<string, string>;
  focusedPlayerIds?: string[];
  loverMarkedPlayerIds?: string[];
  werewolfVotes?: { targetId: string; confirmed: boolean }[];
  vote?: VoteView;
  phase?: string;
  viewerRole?: "player" | "storyteller" | "gamemaster";
  maskNightCameras?: boolean;
  nightVisiblePlayerIds?: string[];
};

function CameraTile({ player, own, stream, approved, frameName, frameOverlayName, selected, canVote, onVote, voteCount, wolfVotes, loverMarked, nightMasked }: {
  player: PublicPlayer;
  own: boolean;
  stream: MediaStream | undefined | null;
  approved: boolean;
  frameName: string;
  frameOverlayName?: string;
  selected: boolean;
  canVote: boolean;
  onVote: () => void;
  voteCount: number;
  wolfVotes: { confirmed: boolean }[];
  loverMarked: boolean;
  nightMasked: boolean;
}) {
  const contents: ReactNode = <>
    <div className="camera-layer__picture">
      {stream ? <CameraVideo stream={stream} /> : (
        <div className="camera-layer__placeholder">
          <span>📷</span>
          <small>{own ? "Deine Kamera ist aus" : approved ? "Verbinde Kamera …" : "Kamera noch nicht freigegeben"}</small>
        </div>
      )}
      {nightMasked && <div className="camera-layer__night-mask" aria-hidden="true" />}
      <CameraFrame filename={frameName} overlayFilename={frameOverlayName} selected={selected} />
      {loverMarked && (loverIcon
        ? <img className="camera-layer__lover-icon" src={loverIcon} alt="Verliebt" draggable={false} />
        : <span className="camera-layer__lover-icon" aria-label="Verliebt">♥</span>)}
      {wolfVotes.length > 0 && (
        <div className="camera-layer__vote-icons camera-layer__vote-icons--werewolf" aria-label="Werwolf-Stimmen">
          {wolfVotes.slice(0, 6).map((entry, index) => (
            <img key={index} src={werewolfVoteIcon} alt={entry.confirmed ? "Bestätigte Stimme" : "Vorläufige Stimme"}
              className={entry.confirmed ? "camera-layer__vote--confirmed" : "camera-layer__vote--pending"}
              draggable={false} />
          ))}
          {wolfVotes.length > 6 && <span className="camera-layer__vote-more">+{wolfVotes.length - 6}</span>}
        </div>
      )}
      {voteCount > 0 && (
        <div className="camera-layer__vote-icons" aria-hidden="true">
          {Array.from({ length: Math.min(voteCount, 6) }, (_, index) => (
            <img key={index} src={villageVoteIcon} alt="" draggable={false} />
          ))}
          {voteCount > 6 && <span className="camera-layer__vote-more">+{voteCount - 6}</span>}
        </div>
      )}
    </div>

  </>;

  return <button type="button"
    data-animation-player-id={player.id}
    className={`camera-layer__frame${canVote ? " camera-layer__frame--votable" : ""}`}
    onClick={onVote} disabled={!canVote}
    aria-pressed={canVote ? selected : undefined}
    aria-label={canVote ? `Für ${player.name} stimmen` : `Kamera von ${player.name}`}>
    {contents}
    <span className="camera-layer__label">{player.name}</span>
  </button>;
}

export default function CameraLayer({ players, roleAction = null, visibleFrames = {}, focusedPlayerIds = [], loverMarkedPlayerIds = [], werewolfVotes = [], vote = null, phase, viewerRole,
  maskNightCameras = false, nightVisiblePlayerIds = [] }: Props) {
  // Streams bleiben unverändert.
  const { localStream, remoteStreams, approvedIds } = useCamera();
  const selfId = socket.id;
  const containerRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const playerOrder = useRef<string[]>([]);
  const playerIds = players.filter(player => player.userRole === "player").map(player => player.id);
  const idSet = new Set(playerIds);
  if (playerOrder.current.length !== playerIds.length ||
      playerOrder.current.some(id => !idSet.has(id))) {
    const retained = playerOrder.current.filter(id => idSet.has(id));
    playerOrder.current = [...retained, ...playerIds.filter(id => !retained.includes(id))];
  }

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setArea(prev => prev.width === rect.width && prev.height === rect.height
        ? prev : { width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const ellipse = useMemo(
    () => calculateCameraEllipse(playerOrder.current, area.width, area.height),
    [playerIds.join("|"), area.width, area.height],
  );
  const focused = phase === "night" ? playerOrder.current.filter(id => focusedPlayerIds.includes(id)) : [];
  const staticObstacles = players.filter(player => player.userRole === "player" &&
    !focused.includes(player.id) && ellipse.positions[player.id]).map(player => ({
      ...ellipse.positions[player.id],
      width: ellipse.cameraWidth * (!player.isAlive && phase !== "finished" ? CAMERA_ELLIPSE.deadScale : 1),
    }));
  staticObstacles.push({ ...ellipse.narratorPosition, width: ellipse.narratorWidth });
  const focusTargets = calculateFocusTargets(
    focused, area.width, area.height, ellipse.cameraWidth, staticObstacles,
  );


  useEffect(() => {
    if (!area.width || !area.height) return;
    reportCameraSize(ellipse.isLimited ? ellipse.cameraPercent : null);
    return () => reportCameraSize(null);
  }, [area.width, area.height, ellipse.isLimited, ellipse.cameraPercent]);
  const canVote = viewerRole === "player" && phase === "day" &&
    players.some(p => p.id === selfId && p.userRole === "player" && p.isAlive) && vote?.state === "open";

  const tiles = new Map(players.filter(player => player.userRole !== "gamemaster").map(player => {
    const own = player.id === selfId;
    const stream = own ? localStream : remoteStreams[player.id];
    const approved = approvedIds.includes(player.id);
    const nightMasked = phase === "night" && maskNightCameras && !own &&
      !nightVisiblePlayerIds.includes(player.id);
    let frameName = visibleFrames[player.id] ?? "frame-default.png";
    let frameOverlayName: string | undefined;
    if (player.userRole === "storyteller") frameName = "frame-storyteller.png";
    else if (!player.isAlive && phase !== "finished") frameName = "frame-dead.png";
    if (nightMasked || (!own && !approved)) frameOverlayName = "frame-blocked.png";

    const nightSelectable = Boolean(phase === "night" && viewerRole === "player" &&
      roleAction?.active && !roleAction.confirmed && roleAction.targetIds.includes(player.id));
    const votable = Boolean((canVote && player.userRole === "player" && player.isAlive) || nightSelectable);
    const showVoteIcons = (phase === "day" || phase === "finished") && (
      vote?.state === "closed" ||
      (viewerRole === "gamemaster" && vote?.state === "open")
    );
    const voteCount = showVoteIcons
      ? (vote?.results.find(result => result.target === player.name)?.votes ?? 0)
      : 0;

    return [player.id, {
      player, own, stream, approved, frameName, frameOverlayName, canVote: votable, voteCount,
      wolfVotes: phase === "night" ? werewolfVotes.filter(v => v.targetId === player.id) : [],
      loverMarked: loverMarkedPlayerIds.includes(player.id),
      selected: phase === "night"
        ? (roleAction?.selectedTargetIds?.includes(player.id) ?? roleAction?.selectedTargetId === player.id)
        : vote?.state === "open" && vote.myVote === player.name,
      nightMasked,
      onVote: () => socket.emit(nightSelectable ? "role:select" : "day-vote:cast", player.id),
    }] as const;
  }));

  return (
    <div ref={containerRef} className="camera-layer camera-layer--ellipse">
      {area.width > 0 && area.height > 0 && players.filter(player => player.userRole !== "gamemaster").map(player => {
        const tile = tiles.get(player.id);
        if (!tile) return null;
        const narrator = player.userRole === "storyteller";
        const point = narrator ? ellipse.narratorPosition : ellipse.positions[player.id];
        if (!point) return null;
        const target = !narrator ? focusTargets[player.id] : undefined;
        const isDead = !player.isAlive && phase !== "finished";
        const position = target
          ? { ...target, focused: true }
          : { ...point, scale: narrator ? 1 : isDead ? CAMERA_ELLIPSE.deadScale : 1, focused: false };
        return <CameraMotionSlot key={player.id} position={position}
          width={narrator ? ellipse.narratorWidth : ellipse.cameraWidth}
          obstacles={staticObstacles.filter(other => Math.hypot(other.x - point.x, other.y - point.y) > 1)}
          flightIndex={target ? focused.indexOf(player.id) : playerOrder.current.indexOf(player.id) % 3}
          narrator={narrator}>
          <CameraTile {...tile} />
        </CameraMotionSlot>;
      })}
    </div>
  );
}
