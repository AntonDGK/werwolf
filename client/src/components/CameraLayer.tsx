import { useEffect, useRef } from "react";
import type { PublicPlayer } from "../types/Player";
import { useCamera } from "../camera/useCamera";
import { socket } from "../socket";
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

type Props = { players: PublicPlayer[] };

export default function CameraLayer({ players }: Props) {
  const { localStream, remoteStreams, approvedIds } = useCamera();
  const selfId = socket.id;
  return (
    <div className="camera-layer">
      {players.filter((player) => player.userRole !== "gamemaster").map((player) => {
        const own = player.id === selfId;
        const stream = own ? localStream : remoteStreams[player.id];
        const approved = approvedIds.includes(player.id);
        return (
          <div key={player.id} className="camera-layer__frame">
            <div className="camera-layer__picture">
              {stream ? <CameraVideo stream={stream} /> : (
                <div className="camera-layer__placeholder">
                  <span>📷</span>
                  <small>{own ? "Deine Kamera ist aus" : approved ? "Verbinde Kamera …" : "Kamera noch nicht freigegeben"}</small>
                </div>
              )}
            </div>
            <div className="camera-layer__label">{player.name}{own ? " (Du)" : ""}</div>
          </div>
        );
      })}
    </div>
  );
}
