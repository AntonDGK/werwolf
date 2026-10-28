import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { PublicPlayer } from "../types/Player";
import { useCamera } from "../camera/useCamera";
import { socket } from "../socket";
import CameraFrame from "./CameraFrame";
import villageVoteIcon from "../assets/icons/vote-villager.png";
import "./CameraLayer.css";
import "./CameraVoteEffects.css";
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
  targetIds: string[];
};

type Props = {
  players: PublicPlayer[];
  roleAction?: RoleActionView | null;
  visibleFrames?: Record<string, string>;
  vote?: VoteView;
  elimination?: { playerId: string; sequence: number } | null;
  phase?: string;
  viewerRole?: "player" | "storyteller" | "gamemaster";
  maskNightCameras?: boolean;
};

function CameraTile({ player, own, stream, approved, frameName, selected, canVote, onVote, voteCount, deathEffectSequence, nightMasked }: {
  player: PublicPlayer;
  own: boolean;
  stream: MediaStream | undefined | null;
  approved: boolean;
  frameName: string;
  selected: boolean;
  canVote: boolean;
  onVote: () => void;
  voteCount: number;
  deathEffectSequence?: number;
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
      <CameraFrame filename={frameName} selected={selected} />
      {deathEffectSequence !== undefined && (
        // Todesanimation
        <span key={deathEffectSequence} className="camera-layer__elimination" aria-hidden="true">💀</span>
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

  // Kamera-Video bleibt gemountet.
  return <button type="button"
    className={`camera-layer__frame${canVote ? " camera-layer__frame--votable" : ""}`}
    onClick={onVote} disabled={!canVote}
    aria-pressed={canVote ? selected : undefined}
    aria-label={canVote ? `Für ${player.name} stimmen` : `Kamera von ${player.name}`}>
    {contents}
  </button>;
}

export default function CameraLayer({ players, roleAction = null, visibleFrames = {}, vote = null, elimination = null, phase, viewerRole,
  maskNightCameras = false }: Props) {
  // Streams bleiben unverändert.
  const { localStream, remoteStreams, approvedIds } = useCamera();
  const selfId = socket.id;
  const canVote = viewerRole === "player" && phase === "day" &&
    players.some(p => p.id === selfId && p.userRole === "player" && p.isAlive) && vote?.state === "open";

  return (
    <div className="camera-layer">
      {players.filter((player) => player.userRole !== "gamemaster").map((player) => {
        const own = player.id === selfId;
        const stream = own ? localStream : remoteStreams[player.id];
        const approved = approvedIds.includes(player.id);
        const nightMasked = phase === "night" && maskNightCameras && !own;
        let frameName = visibleFrames[player.id] ?? "frame-default.png";
        if (nightMasked || (!own && !approved)) frameName = "frame-blocked.png";
        else if (!player.isAlive) frameName = "frame-dead.png";
        else if (player.userRole === "storyteller") frameName = "frame-storyteller.png";

        const nightSelectable = Boolean(phase === "night" && viewerRole === "player" &&
          roleAction?.active && !roleAction.confirmed && roleAction.targetIds.includes(player.id));
        const votable = Boolean((canVote && player.userRole === "player" && player.isAlive) || nightSelectable);
        // Dorfstimmen nur für Berechtigte.
        const showVoteIcons = (phase === "day" || phase === "finished") && (
          vote?.state === "closed" ||
          (viewerRole === "gamemaster" && vote?.state === "open")
        );
        const voteCount = showVoteIcons
          ? (vote?.results.find(result => result.target === player.name)?.votes ?? 0)
          : 0;
        return <CameraTile key={player.id} player={player} own={own} stream={stream}
          approved={approved} frameName={frameName} canVote={votable} voteCount={voteCount}
          deathEffectSequence={elimination?.playerId === player.id ? elimination.sequence : undefined}
          selected={phase === "night"
            ? roleAction?.selectedTargetId === player.id
            : vote?.state === "open" && vote.myVote === player.name}
          nightMasked={nightMasked}
          onVote={() => socket.emit(nightSelectable ? "role:select" : "day-vote:cast", player.id)} />;
      })}
    </div>
  );
}
