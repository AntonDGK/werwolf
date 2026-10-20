import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

type Signal =
  | { type: "offer"; sessionId: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sessionId: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; sessionId: string; candidate: RTCIceCandidateInit }
  | { type: "stop"; sessionId: string };

type Incoming = { senderId: string; signal: Signal };
type Session = { peerId: string; sessionId: string; direction: "send" | "receive" };
type PendingOffer = { senderId: string; sessionId: string; sdp: RTCSessionDescriptionInit };

// Demo: genau eine Peer-Verbindung pro Browserfenster, ohne Audio.
const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export default function CameraPreview() {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [status, setStatus] = useState("Kamera aus. Keine Vorschau und keine Übertragung.");
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(false);
  const [myId, setMyId] = useState(socket.id ?? "");
  const [targetId, setTargetId] = useState("");
  const [pendingOffer, setPendingOffer] = useState<PendingOffer | null>(null);
  const [callStatus, setCallStatus] = useState("Keine Verbindung. Niemand sieht deine Kamera.");
  const [inCall, setInCall] = useState(false);
  const [remoteVisible, setRemoteVisible] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const popupRef = useRef<Window | null>(null);
  const timerRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const selectedRef = useRef("");
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const pendingRef = useRef<PendingOffer | null>(null);
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const sendSignal = (target: string, signal: Signal) => {
    if (socket.connected) socket.emit("webrtc:signal", { targetId: target, signal });
  };

  const clearConnection = (notifyPeer = true) => {
    const session = sessionRef.current;
    sessionRef.current = null;
    pendingRef.current = null;
    setPendingOffer(null);
    iceQueueRef.current = [];
    if (notifyPeer && session) {
      sendSignal(session.peerId, { type: "stop", sessionId: session.sessionId });
    }
    const pc = pcRef.current;
    pcRef.current = null;
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
    }
    remoteStreamRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setRemoteVisible(false);
    setInCall(false);
    setCallStatus("Keine Verbindung. Niemand sieht deine Kamera.");
  };

  const stop = () => {
    // Wichtig: Beim Schließen der Vorschau endet auch jede laufende Übertragung.
    clearConnection();
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

  const newConnection = (peerId: string, sessionId: string) => {
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    pc.onicecandidate = (event) => {
      if (event.candidate && pcRef.current === pc) {
        sendSignal(peerId, { type: "ice", sessionId, candidate: event.candidate.toJSON() });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pcRef.current !== pc) return;
      if (pc.connectionState === "connected") {
        setCallStatus("WebRTC verbunden.");
      } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        clearConnection();
        setCallStatus("WebRTC-Verbindung beendet oder fehlgeschlagen.");
      } else if (pc.connectionState === "disconnected") {
        setCallStatus("Verbindung unterbrochen. Bei Problemen bitte stoppen.");
      }
    };
    return pc;
  };

  const flushIce = async (pc: RTCPeerConnection) => {
    const queue = iceQueueRef.current.splice(0);
    for (const candidate of queue) {
      if (pcRef.current !== pc) return;
      try { await pc.addIceCandidate(candidate); } catch { /* Verbindung kann bereits beendet sein */ }
    }
  };

  useEffect(() => {
    void refresh();
    const onDeviceChange = () => { void refresh(); };
    const onConnect = () => { setMyId(socket.id ?? ""); };
    const onDisconnect = () => {
      setMyId("");
      clearConnection(false);
      setCallStatus("Serververbindung getrennt – Übertragung gestoppt.");
    };
    const onSignal = (data: Incoming) => {
      if (!data || typeof data.senderId !== "string" || !data.signal) return;
      const { senderId, signal } = data;
      if (typeof signal.sessionId !== "string") return;

      if (signal.type === "offer") {
        // Keine automatische Annahme fremder Verbindungen.
        if (sessionRef.current || pendingRef.current || !signal.sdp || signal.sdp.type !== "offer") {
          sendSignal(senderId, { type: "stop", sessionId: signal.sessionId });
          return;
        }
        const offer = { senderId, sessionId: signal.sessionId, sdp: signal.sdp };
        pendingRef.current = offer;
        setPendingOffer(offer);
        setCallStatus("Eingehende Videoanfrage – erst nach Annahme sichtbar.");
        return;
      }
      const session = sessionRef.current;
      if (!session && signal.type === "ice" && pendingRef.current?.senderId === senderId &&
          pendingRef.current.sessionId === signal.sessionId && signal.candidate &&
          typeof signal.candidate.candidate === "string") {
        if (iceQueueRef.current.length < 100) iceQueueRef.current.push(signal.candidate);
        return;
      }
      if (!session || session.peerId !== senderId || session.sessionId !== signal.sessionId) return;
      if (signal.type === "stop") {
        clearConnection(false);
        setCallStatus("Die andere Seite hat die Verbindung beendet.");
      } else if (signal.type === "answer" && session.direction === "send") {
        const pc = pcRef.current;
        if (!pc || !signal.sdp || signal.sdp.type !== "answer" || pc.signalingState !== "have-local-offer") return;
        void (async () => {
          try {
            await pc.setRemoteDescription(signal.sdp);
            if (pcRef.current === pc) await flushIce(pc);
          } catch {
            if (pcRef.current === pc) clearConnection();
          }
        })();
      } else if (signal.type === "ice" && signal.candidate && typeof signal.candidate.candidate === "string") {
        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription) {
          if (iceQueueRef.current.length < 100) iceQueueRef.current.push(signal.candidate);
        } else {
          void pc.addIceCandidate(signal.candidate).catch(() => {});
        }
      }
    };
    const onPageHide = () => {
      clearConnection();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("webrtc:signal", onSignal);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      requestRef.current++;
      clearConnection();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("webrtc:signal", onSignal);
      window.removeEventListener("pagehide", onPageHide);
    };
    // Alle Eventhandler arbeiten mit Refs, um keine veralteten Kamera-/Verbindungswerte zu verwenden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (remoteVisible && remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [remoteVisible]);

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
    const popup = window.open("", "", "width=850,height=560");
    if (!popup) {
      setStatus("Vorschaufenster blockiert. Kamera bleibt aus. Bitte Pop-ups erlauben.");
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
    hint.textContent = "Fenster schließen = Kamera und Übertragung stoppen.";
    popup.document.body.append(heading, video, hint);

    const token = ++requestRef.current;
    setLoading(true);
    setStatus("Warte auf Kameraberechtigung …");
    timerRef.current = window.setInterval(() => {
      if (popup.closed) {
        stop();
        setStatus("Vorschaufenster geschlossen. Kamera und Übertragung ausgeschaltet.");
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
      setStatus("Private Vorschau aktiv. Noch keine Übertragung an Mitspieler.");
    } catch (error) {
      stop();
      setStatus(error instanceof Error ? `Kamera nicht gestartet: ${error.message}` : "Kamera konnte nicht gestartet werden.");
    } finally {
      if (token === requestRef.current) setLoading(false);
    }
  };

  const sendVideo = async () => {
    const stream = streamRef.current;
    const peerId = targetId.trim();
    if (!socket.connected || !socket.id || !stream || !active ||
        !stream.getVideoTracks().some((track) => track.readyState === "live") ||
        !peerId || peerId === socket.id || sessionRef.current || pendingRef.current) return;
    if (!window.confirm(
      `DEINE KAMERA AN SPIELER ${peerId} ÜBERTRAGEN?\n\n` +
      "Das ist KEINE private Vorschau mehr. Der Empfänger kann dein Bild sehen oder aufnehmen. " +
      "Nur für einen privaten Test fortfahren?"
    )) return;

    const sessionId = crypto.randomUUID();
    sessionRef.current = { peerId, sessionId, direction: "send" };
    setInCall(true);
    setCallStatus("Warte darauf, dass die andere Seite die Anfrage annimmt …");
    try {
      const pc = newConnection(peerId, sessionId);
      stream.getVideoTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      if (pcRef.current !== pc) return;
      await pc.setLocalDescription(offer);
      if (pcRef.current !== pc) return;
      sendSignal(peerId, { type: "offer", sessionId, sdp: offer });
    } catch (error) {
      clearConnection();
      setCallStatus(error instanceof Error ? `Fehler: ${error.message}` : "Verbindung fehlgeschlagen.");
    }
  };

  const acceptOffer = async () => {
    const offer = pendingRef.current;
    if (!offer || sessionRef.current) return;
    if (!window.confirm(`Videobild von ${offer.senderId} anzeigen? Die eigene Kamera wird NICHT gestartet oder gesendet.`)) return;
    pendingRef.current = null;
    setPendingOffer(null);
    sessionRef.current = { peerId: offer.senderId, sessionId: offer.sessionId, direction: "receive" };
    setInCall(true);
    setCallStatus("Verbinde mit der anderen Seite …");
    try {
      const pc = newConnection(offer.senderId, offer.sessionId);
      pc.ontrack = (event) => {
        if (pcRef.current !== pc) return;
        setRemoteVisible(true);
        remoteStreamRef.current = event.streams[0] ?? new MediaStream([event.track]);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
      };
      await pc.setRemoteDescription(offer.sdp);
      if (pcRef.current !== pc) return;
      await flushIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (pcRef.current !== pc) return;
      sendSignal(offer.senderId, { type: "answer", sessionId: offer.sessionId, sdp: answer });
    } catch (error) {
      clearConnection();
      setCallStatus(error instanceof Error ? `Fehler: ${error.message}` : "Verbindung fehlgeschlagen.");
    }
  };

  const rejectOffer = () => {
    const offer = pendingRef.current;
    if (offer) sendSignal(offer.senderId, { type: "stop", sessionId: offer.sessionId });
    pendingRef.current = null;
    iceQueueRef.current = [];
    setPendingOffer(null);
    setCallStatus("Videoanfrage abgelehnt.");
  };

  return (
    <section style={{ maxWidth: 600, width: "100%", boxSizing: "border-box", margin: "12px auto", color: "white" }}>
      <details style={{ background: "#251d19", borderRadius: 12, border: "1px solid #71584b" }}>
        <summary style={{ cursor: "pointer", padding: "12px 16px", fontWeight: 700 }}>
          Kamera &amp; WebRTC-Test {inCall ? "🔴 Übertragung aktiv" : active ? "🟢 Private Vorschau aktiv" : "(eingeklappt)"}
          {pendingOffer ? " – Videoanfrage erhalten!" : ""}
        </summary>
        <div style={{ padding: "0 16px 16px" }}>
      <h2>Meine Kamera – sichere Vorschau</h2>
      <p style={{ fontSize: 13 }}>Einklappen stoppt die Kamera oder eine laufende Übertragung nicht. Verwende dafür „Kamera ausschalten“ bzw. „Übertragung stoppen“.</p>
      <p>Keine Kamera wird automatisch gestartet. Eine Übertragung braucht eine zusätzliche Bestätigung.</p>
      <label htmlFor="camera-source">Kameraquelle</label>
      <select id="camera-source" value={deviceId}
        onChange={(event) => { stop(); selectedRef.current = event.target.value; setDeviceId(event.target.value); }}
        style={{ display: "block", width: "100%", margin: "8px 0 12px", padding: 10 }}>
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
      <hr style={{ margin: "22px 0" }} />
      <h3>WebRTC-Test (ein Spieler → ein Zuschauer)</h3>
      <p><strong>Meine Socket-ID:</strong> <code style={{ wordBreak: "break-all" }}>{myId || "Nicht verbunden"}</code></p>
      <p style={{ fontSize: 13 }}>Beide Browser müssen zuerst über „Beitreten“ in die Lobby. Kopiere die Socket-ID des Zuschauers ins Senderfenster.</p>
      <label htmlFor="target-id">Socket-ID des Zuschauers</label>
      <input id="target-id" value={targetId} onChange={(e) => setTargetId(e.target.value)}
        placeholder="Socket-ID aus dem anderen Fenster" style={{ display: "block", boxSizing: "border-box", width: "100%", padding: 10, margin: "8px 0" }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" onClick={() => void sendVideo()}
          disabled={!active || !myId || !targetId.trim() || inCall || !!pendingOffer}>
          Kamera für diesen Zuschauer freigeben …
        </button>
        <button type="button" disabled={!inCall} onClick={() => clearConnection()}>
          Übertragung stoppen
        </button>
      </div>
      {pendingOffer && (
        <div style={{ border: "1px solid #d6a949", padding: 12, marginTop: 12 }}>
          <p>Videoanfrage von <code style={{ wordBreak: "break-all" }}>{pendingOffer.senderId}</code></p>
          <button type="button" onClick={() => void acceptOffer()}>Video annehmen</button>{" "}
          <button type="button" onClick={rejectOffer}>Ablehnen</button>
        </div>
      )}
      <p role="status">{callStatus}</p>
      <video ref={remoteVideoRef} autoPlay playsInline muted controls={false}
        style={{ display: remoteVisible ? "block" : "none", width: "100%", maxHeight: 320, background: "black" }} />
      <small>Nur privater Techniktest. Noch keine Einladungscodes oder Zugangskontrolle. Bei Bildschirmaufnahme kann auch das empfangene Video im Stream sichtbar sein.</small>
        </div>
      </details>
    </section>
  );
}
