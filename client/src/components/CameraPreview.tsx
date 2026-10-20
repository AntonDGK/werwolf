import { useEffect, useRef, useState } from "react";

export default function CameraPreview() {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [status, setStatus] = useState("Kamera aus. Keine Vorschau und keine Übertragung.");
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const popupRef = useRef<Window | null>(null);
  const timerRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const selectedRef = useRef("");

  const stop = () => {
    requestRef.current++;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    popupRef.current = null;
    setLoading(false);
    setActive(false);
    setStatus("Kamera aus. Keine Vorschau und keine Übertragung.");
  };

  const refresh = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setStatus("Kameraauswahl wird von diesem Browser nicht unterstützt.");
      return;
    }
    try {
      const list = (await navigator.mediaDevices.enumerateDevices()).filter(
        (item) => item.kind === "videoinput" && item.deviceId
      );
      setCameras(list);
      if (selectedRef.current && !list.some((item) => item.deviceId === selectedRef.current)) {
        stop();
        selectedRef.current = "";
        setDeviceId("");
        setStatus("Kamera nicht mehr verfügbar. Bitte neu auswählen.");
      }
    } catch {
      setStatus("Kameraliste konnte nicht geladen werden.");
    }
  };

  useEffect(() => {
    void refresh();
    const changed = () => { void refresh(); };
    const leaving = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", changed);
    window.addEventListener("pagehide", leaving);
    return () => {
      requestRef.current++;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
      navigator.mediaDevices?.removeEventListener?.("devicechange", changed);
      window.removeEventListener("pagehide", leaving);
    };
  }, []);

  const start = async () => {
    if (!deviceId || loading || active) return;
    const camera = cameras.find((item) => item.deviceId === deviceId);
    if (!camera?.label) {
      setStatus("Kameraname nicht erkennbar. Aus Sicherheitsgründen keine Vorschau starten.");
      return;
    }
    const agreed = window.confirm(
      `ACHTUNG: Du aktivierst jetzt „${camera.label}“. Das Kamerabild erscheint in einem SEPARATEN Fenster. ` +
      "Wenn OBS deinen gesamten Bildschirm aufnimmt, könnte es im Stream sichtbar sein. " +
      "Hast du die Kameraquelle und deine OBS-Aufnahme geprüft?"
    );
    if (!agreed) return;

    // Fenster im direkten Klick-Kontext öffnen, bevor die Kamera angefragt wird.
    const popup = window.open("", "", "width=850,height=560");
    if (!popup) {
      setStatus("Vorschaufenster wurde blockiert. Kamera bleibt aus. Pop-ups für diese Seite erlauben.");
      return;
    }
    popupRef.current = popup;
    popup.document.title = "Private Kameravorschau – NICHT im Stream zeigen";
    popup.document.body.style.cssText = "margin:0;padding:18px;background:#171717;color:white;font:16px sans-serif";
    const heading = popup.document.createElement("h2");
    heading.textContent = "PRIVATE VORSCHAU – NICHT IM STREAM ZEIGEN";
    const video = popup.document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = "display:block;width:100%;max-height:75vh;background:black;object-fit:contain";
    const hint = popup.document.createElement("p");
    hint.textContent = "Schließe dieses Fenster, um die Kamera auszuschalten. Keine Übertragung an Mitspieler.";
    popup.document.body.append(heading, video, hint);

    const token = ++requestRef.current;
    setLoading(true);
    setStatus("Warte auf Kameraberechtigung …");
    timerRef.current = window.setInterval(() => {
      if (popup.closed) {
        stop();
        setStatus("Vorschaufenster geschlossen. Kamera ausgeschaltet.");
      }
    }, 300);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: deviceId } },
      });
      if (token !== requestRef.current || popup.closed) {
        stream.getTracks().forEach((track) => track.stop());
        if (token === requestRef.current) stop();
        return;
      }
      const track = stream.getVideoTracks()[0];
      const actualId = track?.getSettings().deviceId;
      if (!track || (actualId && actualId !== deviceId)) {
        stream.getTracks().forEach((item) => item.stop());
        throw new Error("Die gewählte Kamera konnte nicht bestätigt werden.");
      }
      streamRef.current = stream;
      track.addEventListener("ended", () => {
        if (streamRef.current === stream) {
          stop();
          setStatus("Kamera getrennt. Kein automatischer Wechsel.");
        }
      });
      video.srcObject = stream;
      setActive(true);
      setStatus("Private Vorschau im separaten Fenster aktiv. Keine Übertragung an Mitspieler.");
    } catch (error) {
      stop();
      setStatus(error instanceof Error ? `Kamera nicht gestartet: ${error.message}` : "Kamera konnte nicht gestartet werden.");
    } finally {
      if (token === requestRef.current) setLoading(false);
    }
  };

  return (
    <section style={{ maxWidth: 560, margin: "24px auto", padding: 20, background: "#251d19", color: "white", borderRadius: 16 }}>
      <h2>Meine Kamera – sichere Vorschau</h2>
      <p>Die Kamera bleibt ausgeschaltet, bis du eine Quelle auswählst und ausdrücklich bestätigst.</p>
      <label htmlFor="camera-source">Kameraquelle</label>
      <select
        id="camera-source"
        value={deviceId}
        onChange={(event) => { stop(); selectedRef.current = event.target.value; setDeviceId(event.target.value); }}
        style={{ display: "block", width: "100%", margin: "8px 0 12px", padding: 10 }}
      >
        <option value="">Bitte Kamera auswählen</option>
        {cameras.map((camera, index) => (
          <option key={camera.deviceId} value={camera.deviceId}>
            {camera.label || `Unbekannte Kamera ${index + 1} (nicht starten)`}
          </option>
        ))}
      </select>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" onClick={() => void refresh()}>Kameras aktualisieren</button>
        <button type="button" disabled={!deviceId || loading || active} onClick={() => void start()}>
          {loading ? "Starte …" : "Private Vorschau öffnen"}
        </button>
        <button type="button" disabled={!loading && !active} onClick={stop}>Kamera ausschalten</button>
      </div>
      <p role="status">{status}</p>
      <small>Falls der Browser die Kameranamen verbirgt, wird die Vorschau aus Sicherheitsgründen nicht gestartet. Kein automatischer Wechsel auf eine andere Kamera.</small>
    </section>
  );
}
