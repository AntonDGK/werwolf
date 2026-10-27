import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { PublicPlayer } from "../types/Player";
import { useCamera } from "../camera/useCamera";
import { socket } from "../socket";
import CameraFrame, { type CameraFrameKind } from "./CameraFrame";
import villageVoteIcon from "../assets/icons/vote-villager.png";
import "./CameraLayer.css";

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
type Props = {
  players: PublicPlayer[];
  privateRoleId?: string | null;
  teammateIds?: string[];
  vote?: VoteView;
  phase?: string;
  viewerRole?: "player" | "storyteller" | "gamemaster";
};

function CameraTile({ player, own, stream, approved, kind, selected, canVote, onVote, voteCount }: {
  player: PublicPlayer;
  own: boolean;
  stream: MediaStream | undefined | null;
  approved: boolean;
  kind: CameraFrameKind;
  selected: boolean;
  canVote: boolean;
  onVote: () => void;
  voteCount: number;
}) {
  const contents: ReactNode = <>
    <div className="camera-layer__picture">
      {stream ? <CameraVideo stream={stream} /> : (
        <div className="camera-layer__placeholder">
          <span>📷</span>
          <small>{own ? "Deine Kamera ist aus" : approved ? "Verbinde Kamera …" : "Kamera noch nicht freigegeben"}</small>
        </div>
      )}
      <CameraFrame kind={kind} selected={selected} />
      {voteCount > 0 && (
        <div className="camera-layer__vote-icons" aria-hidden="true">
          {Array.from({ length: Math.min(voteCount, 6) }, (_, index) => (
            <img key={index} src={villageVoteIcon} alt="" draggable={false} />
          ))}
          {voteCount > 6 && <span className="camera-layer__vote-more">+{voteCount - 6}</span>}
        </div>
      )}
    </div>
    <div className="camera-layer__label">{player.name}{own ? " (Du)" : ""}</div>
  </>;

  // Ein konstantes Button-Element verhindert ein Unmount des WebRTC-Videos
  // beim Starten/Schließen der Abstimmung.
  return <button type="button"
    className={`camera-layer__frame${canVote ? " camera-layer__frame--votable" : ""}`}
    onClick={onVote} disabled={!canVote}
    aria-pressed={canVote ? selected : undefined}
    aria-label={canVote ? `Für ${player.name} stimmen` : `Kamera von ${player.name}`}>
    {contents}
  </button>;
}

export default function CameraLayer({ players, privateRoleId, teammateIds = [], vote = null, phase, viewerRole }: Props) {
  // Die WebRTC-Streams bleiben unverändert. Nur die Darstellung erhält PNG-Ebenen.
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
        let kind: CameraFrameKind = "default";
        if (!player.isAlive) kind = "dead";
        else if (player.userRole === "storyteller") kind = "storyteller";
        else if (!own && !approved) kind = "blocked";
        else if (own && privateRoleId === "werewolf") kind = "werewolf";
        else if (own && privateRoleId === "seer") kind = "seer";
        else if (privateRoleId === "werewolf" && teammateIds.includes(player.id)) kind = "werewolf";

        const votable = Boolean(canVote && player.userRole === "player" && player.isAlive);
        const voteCount = phase === "day" && vote?.state !== "idle"
          ? (vote?.results.find(result => result.target === player.name)?.votes ?? 0)
          : 0;
        return <CameraTile key={player.id} player={player} own={own} stream={stream}
          approved={approved} kind={kind} canVote={votable} voteCount={voteCount}
          selected={vote?.state === "open" && vote.myVote === player.name}
          onVote={() => socket.emit("day-vote:cast", player.id)} />;
      })}
    </div>
  );
}
