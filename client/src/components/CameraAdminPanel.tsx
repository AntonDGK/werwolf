import { useEffect, useRef } from "react";
import type { MediaHTMLAttributes } from "react";
import { useCamera } from "../camera/useCamera";
import "./CameraAdminPanel.css";

function AdminVideo({ stream }: { stream: MediaStream } & MediaHTMLAttributes<HTMLVideoElement>) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = stream;
    void element.play().catch(() => {});
    return () => { element.srcObject = null; };
  }, [stream]);
  return <video className="camera-admin__video" ref={ref} autoPlay playsInline muted />;
}

const statusText: Record<string, string> = {
  off: "Kamera aus / nicht bereit",
  ready: "Bereit zur Prüfung",
  approved: "Im Spiel freigegeben",
  blocked: "PANIC: gesperrt",
};

export default function CameraAdminPanel() {
  const camera = useCamera();
  return (
    <section className="camera-admin">
      <h2>📹 Kamerafreigaben</h2>
      <p>
        Die Streamer müssen ihre Kamera selbst auswählen und ausdrücklich zur Prüfung anbieten.
        Freigeben ist erst nach empfangenem Kontrollbild möglich.
        Du brauchst keine Socket-IDs oder Tokens einzugeben.
      </p>
      {camera.adminCameras.length === 0 && <p>Keine Spieler oder Erzähler angemeldet.</p>}
      <div className="camera-admin__list">
        {camera.adminCameras.map((item) => {
          const stream = camera.remoteStreams[item.id];
          return (
            <article className="camera-admin__card" key={item.id}>
              <h3>{item.name}</h3>
              <p>Status: <strong>{statusText[item.status] ?? item.status}</strong></p>
              {item.reviewing && (
                <div className="camera-admin__preview">
                  {stream ? <AdminVideo stream={stream} /> : <p>Verbinde private Kontrollvorschau …</p>}
                  <p>Überprüfe persönlich, ob die richtige Quelle gezeigt wird.</p>
                </div>
              )}
              <div className="camera-admin__buttons">
                {(item.status === "ready" || item.status === "approved") && !item.reviewing && (
                  <button type="button" onClick={() => camera.review(item.id)}>Privat prüfen</button>
                )}
                {item.reviewing && (
                  <button type="button" onClick={() => camera.stopReview(item.id)}>Vorschau schließen</button>
                )}
                {item.status === "ready" && item.reviewing && item.previewSeen && !!stream && (
                  <button type="button" onClick={() => {
                    if (window.confirm(`${item.name}: Kamerabild geprüft und für ALLE angemeldeten Teilnehmer freigeben?`)) {
                      camera.approve(item.id);
                    }
                  }}>Kamera fürs Spiel freigeben</button>
                )}
                {item.status !== "blocked" && (
                  <button className="camera-admin__danger" type="button" onClick={() => {
                    if (window.confirm(`PANIC: Kamera von ${item.name} sperren und Freigabe vollständig zurücksetzen?`)) camera.panic(item.id);
                  }}>⛔ PANIC</button>
                )}
                {item.status === "blocked" && (
                  <button type="button" onClick={() => camera.unblock(item.id)}>Erneute Einrichtung erlauben</button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
