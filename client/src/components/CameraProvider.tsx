import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { socket } from "../socket";
import { CameraContext } from "../camera/CameraContext";
import type { AdminCamera, CameraStatus } from "../camera/CameraContext";

type Signal =
  | { type: "offer"; sessionId: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sessionId: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; sessionId: string; candidate: RTCIceCandidateInit }
  | { type: "stop"; sessionId: string };

type Incoming = { senderId: string; cameraId: string; epoch: string; signal: Signal };
type Peer = {
  connection: RTCPeerConnection;
  ownerId: string;
  peerId: string;
  epoch: string;
  sessionId: string;
  direction: "send" | "receive";
};

type OwnerState = { status: CameraStatus; epoch: string | null };

const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export default function CameraProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [approvedIds, setApprovedIds] = useState<string[]>([]);
  const [adminCameras, setAdminCameras] = useState<AdminCamera[]>([]);
  const [ownerStatus, setOwnerStatus] = useState<CameraStatus>("off");
  const [statusText, setStatusText] = useState("Kamera aus. Keine Übertragung.");
  const [busy, setBusy] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const selectedRef = useRef("");
  const popupRef = useRef<Window | null>(null);
  const popupTimerRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const epochRef = useRef<string | null>(null);
  const ownerStatusRef = useRef<CameraStatus>("off");
  const peersRef = useRef(new Map<string, Peer>());
  const iceQueueRef = useRef(new Map<string, RTCIceCandidateInit[]>());

  function setOwner(status: CameraStatus, epoch: string | null) {
    epochRef.current = epoch;
    ownerStatusRef.current = status;
    setOwnerStatus(status);
  }

  function sendSignal(targetId: string, cameraId: string, epoch: string, signal: Signal) {
    if (socket.connected) socket.emit("camera:signal", { cameraId, targetId, epoch, signal });
  }

  function closePeer(key: string, notify = false) {
    const peer = peersRef.current.get(key);
    if (!peer) return;
    peersRef.current.delete(key);
    if (notify) {
      const cameraId = peer.ownerId;
      const targetId = peer.direction === "send" ? peer.peerId : peer.ownerId;
      sendSignal(targetId, cameraId, peer.epoch, { type: "stop", sessionId: peer.sessionId });
    }
    peer.connection.ontrack = null;
    peer.connection.onicecandidate = null;
    peer.connection.onconnectionstatechange = null;
    peer.connection.close();
    if (peer.direction === "receive") {
      setRemoteStreams((current) => {
        const next = { ...current };
        delete next[peer.ownerId];
        return next;
      });
    }
  }

  function closeCameraPeers(ownerId: string) {
    for (const [key, peer] of peersRef.current) {
      if (peer.ownerId === ownerId) closePeer(key);
    }
    for (const key of iceQueueRef.current.keys()) {
      if (key.startsWith(`${ownerId}:`)) iceQueueRef.current.delete(key);
    }
  }

  function stopLocal(notifyServer: boolean) {
    requestRef.current += 1;
    if (notifyServer && socket.connected) socket.emit("camera:cancel");
    const myId = socket.id;
    if (myId) closeCameraPeers(myId);
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    if (popupTimerRef.current !== null) window.clearInterval(popupTimerRef.current);
    popupTimerRef.current = null;
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    popupRef.current = null;
    setBusy(false);
    setOwner("off", null);
    setStatusText("Kamera aus. Keine Übertragung.");
  }

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setStatusText("Browser unterstützt keine Kameraauswahl oder HTTPS fehlt.");
      return;
    }
    try {
      const list = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === "videoinput" && device.deviceId);
      setDevices(list);
      if (selectedRef.current && !list.some((device) => device.deviceId === selectedRef.current)) {
        stopLocal(true);
        selectedRef.current = "";
        setDeviceId("");
        setStatusText("Kamera entfernt. Bitte erneut auswählen.");
      }
    } catch {
      setStatusText("Kameraliste konnte nicht geladen werden.");
    }
  }

  function selectDevice(nextId: string) {
    if (selectedRef.current === nextId) return;
    stopLocal(true); // Wechsel einer Kameraquelle widerruft IMMER alte Freigaben.
    selectedRef.current = nextId;
    setDeviceId(nextId);
  }

  async function startPreview() {
    if (busy || streamRef.current || !selectedRef.current) return;
    const selected = devices.find((device) => device.deviceId === selectedRef.current);
    if (!selected?.label) {
      setStatusText("Kameraname fehlt. Bitte erst Kameraquelle prüfen.");
      return;
    }
    if (!window.confirm(
      `Private Vorschau von „${selected.label}“ öffnen? Die Kamera wird noch NICHT an andere übertragen. ` +
      "Prüfe vorher deine OBS-Bildschirmaufnahme."
    )) return;
    const popup = window.open("", "", "width=850,height=560");
    if (!popup) {
      setStatusText("Vorschaufenster blockiert. Kamera bleibt aus.");
      return;
    }
    popupRef.current = popup;
    popup.document.title = "PRIVATE KAMERAVORSCHAU – nicht in OBS zeigen";
    popup.document.body.style.cssText = "margin:0;padding:18px;background:#171717;color:white;font:16px sans-serif";
    const title = popup.document.createElement("h2");
    title.textContent = "PRIVATE VORSCHAU – NICHT IN OBS ZEIGEN";
    const video = popup.document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = "width:100%;max-height:75vh;background:black;object-fit:contain";
    const hint = popup.document.createElement("p");
    hint.textContent = "Fenster schließen = Kamera und alle Übertragungen stoppen.";
    popup.document.body.append(title, video, hint);

    const token = ++requestRef.current;
    setBusy(true);
    setStatusText("Warte auf Kameraberechtigung …");
    popupTimerRef.current = window.setInterval(() => {
      if (popup.closed) {
        stopLocal(true);
        setStatusText("Vorschaufenster geschlossen. Kamera gestoppt.");
      }
    }, 400);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: selectedRef.current } },
      });
      if (token !== requestRef.current || popup.closed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = stream.getVideoTracks()[0];
      const actual = track?.getSettings().deviceId;
      if (!track || (actual && actual !== selectedRef.current)) {
        stream.getTracks().forEach((item) => item.stop());
        throw new Error("Kameraquelle konnte nicht bestätigt werden.");
      }
      streamRef.current = stream;
      setLocalStream(stream);
      video.srcObject = stream;
      track.addEventListener("ended", () => {
        if (streamRef.current === stream) {
          stopLocal(true);
          setStatusText("Kamera getrennt. Kein automatischer Quellenwechsel.");
        }
      });
      setStatusText("Private Vorschau aktiv. Jetzt nach dem Login ausdrücklich zur Prüfung freigeben.");
    } catch (error) {
      stopLocal(true);
      setStatusText(error instanceof Error ? `Kamerafehler: ${error.message}` : "Kamera konnte nicht starten.");
    } finally {
      if (requestRef.current === token) setBusy(false);
    }
  }

  function readyForReview() {
    if (!streamRef.current || !socket.connected || ownerStatusRef.current !== "off") return;
    if (!streamRef.current.getVideoTracks().some((track) => track.readyState === "live")) return;
    if (!window.confirm(
      "Deine ausgewählte Kamera darf jetzt NUR der Gamemaster zur Kontrolle sehen. " +
      "Wenn er sie freigibt, wird dieses Kamerabild anschließend an die angemeldeten Mitspieler übertragen. Fortfahren?"
    )) return;
    socket.emit("camera:ready");
    setStatusText("Freigabe angefragt. Warte auf die Gamemaster-Prüfung.");
  }

  async function flushIce(peer: Peer) {
    const key = `${peer.ownerId}:${peer.sessionId}`;
    const queued = iceQueueRef.current.get(key) ?? [];
    iceQueueRef.current.delete(key);
    for (const candidate of queued) {
      if (peer.connection.signalingState === "closed") break;
      try { await peer.connection.addIceCandidate(candidate); } catch { /* abgebrochene Sitzung */ }
    }
  }

  function newPeer(key: string, ownerId: string, peerId: string, epoch: string,
                   sessionId: string, direction: "send" | "receive"): Peer {
    closePeer(key);
    const connection = new RTCPeerConnection({ iceServers });
    const peer: Peer = { connection, ownerId, peerId, epoch, sessionId, direction };
    peersRef.current.set(key, peer);
    connection.onicecandidate = (event) => {
      if (event.candidate && peersRef.current.get(key) === peer) {
        const targetId = direction === "send" ? peerId : ownerId;
        sendSignal(targetId, ownerId, epoch, {
          type: "ice", sessionId, candidate: event.candidate.toJSON(),
        });
      }
    };
    connection.onconnectionstatechange = () => {
      if (peersRef.current.get(key) !== peer) return;
      if (["failed", "closed"].includes(connection.connectionState)) closePeer(key);
    };
    if (direction === "receive") {
      connection.ontrack = (event) => {
        if (peersRef.current.get(key) !== peer) return;
        const remote = event.streams[0] ?? new MediaStream([event.track]);
        setRemoteStreams((previous) => ({ ...previous, [ownerId]: remote }));
        // Gamemaster-Server prueft Berechtigung nochmals. Die eigentliche
        // optische Kontrolle und finale Freigabe erfolgen per Klick im Adminpanel.
        socket.emit("camera:preview:received", ownerId);
      };
    }
    return peer;
  }

  useEffect(() => {
    const onSignal = (data: Incoming) => {
      if (!data || !data.signal || typeof data.cameraId !== "string" ||
          typeof data.epoch !== "string" || typeof data.senderId !== "string") return;
      const { cameraId, epoch, signal, senderId } = data;
      if (typeof signal.sessionId !== "string") return;
      const myId = socket.id;
      if (!myId) return;
      const isOwner = cameraId === myId;
      const key = isOwner ? `send:${senderId}` : `receive:${cameraId}`;
      const queueKey = `${cameraId}:${signal.sessionId}`;
      if (signal.type === "offer" && !isOwner && signal.sdp?.type === "offer") {
        const existing = peersRef.current.get(key);
        if (existing?.sessionId === signal.sessionId) return;
        const peer = newPeer(key, cameraId, senderId, epoch, signal.sessionId, "receive");
        void (async () => {
          try {
            await peer.connection.setRemoteDescription(signal.sdp);
            if (peersRef.current.get(key) !== peer) return;
            await flushIce(peer);
            const answer = await peer.connection.createAnswer();
            await peer.connection.setLocalDescription(answer);
            if (peersRef.current.get(key) === peer) {
              sendSignal(senderId, cameraId, epoch, { type: "answer", sessionId: signal.sessionId, sdp: answer });
            }
          } catch {
            if (peersRef.current.get(key) === peer) closePeer(key);
          }
        })();
        return;
      }
      const peer = peersRef.current.get(key);
      if (signal.type === "ice" && signal.candidate && typeof signal.candidate.candidate === "string") {
        if (peer?.sessionId === signal.sessionId && peer.connection.remoteDescription) {
          void peer.connection.addIceCandidate(signal.candidate).catch(() => {});
        } else if (!peer || peer.sessionId === signal.sessionId) {
          const current = iceQueueRef.current.get(queueKey) ?? [];
          if (current.length < 80) iceQueueRef.current.set(queueKey, [...current, signal.candidate]);
        }
        return;
      }
      if (!peer || peer.sessionId !== signal.sessionId || peer.epoch !== epoch) return;
      if (signal.type === "stop") closePeer(key);
      if (signal.type === "answer" && isOwner && signal.sdp?.type === "answer") {
        void (async () => {
          try {
            await peer.connection.setRemoteDescription(signal.sdp);
            if (peersRef.current.get(key) === peer) await flushIce(peer);
          } catch {
            if (peersRef.current.get(key) === peer) closePeer(key);
          }
        })();
      }
    };

    const onRequestViewer = (data: { viewerId: string; epoch: string }) => {
      const stream = streamRef.current;
      if (!stream || !socket.id || !data || typeof data.viewerId !== "string" ||
          data.epoch !== epochRef.current || data.viewerId === socket.id) return;
      const key = `send:${data.viewerId}`;
      const current = peersRef.current.get(key);
      if (current?.epoch === data.epoch) return;
      const sessionId = crypto.randomUUID();
      const peer = newPeer(key, socket.id, data.viewerId, data.epoch, sessionId, "send");
      stream.getVideoTracks().forEach((track) => {
        if (track.readyState === "live") peer.connection.addTrack(track, stream);
      });
      void (async () => {
        try {
          const offer = await peer.connection.createOffer();
          await peer.connection.setLocalDescription(offer);
          if (peersRef.current.get(key) === peer) {
            sendSignal(data.viewerId, socket.id!, data.epoch, { type: "offer", sessionId, sdp: offer });
          }
        } catch {
          if (peersRef.current.get(key) === peer) closePeer(key);
        }
      })();
    };
    const onRevoke = (data: { cameraId: string; blocked: boolean }) => {
      if (!data || typeof data.cameraId !== "string") return;
      closeCameraPeers(data.cameraId);
      if (data.cameraId === socket.id) {
        stopLocal(false);
        setOwner(data.blocked ? "blocked" : "off", null);
        setStatusText(data.blocked
          ? "PANIC: Kamera gesperrt. Gamemaster muss erneute Einrichtung erlauben."
          : "Freigabe zurückgesetzt. Kameraquelle neu prüfen.");
      }
    };
    const onOwnerState = (data: OwnerState) => {
      if (!data || !["off", "ready", "approved", "blocked"].includes(data.status)) return;
      setOwner(data.status, typeof data.epoch === "string" ? data.epoch : null);
      if (data.status === "approved") setStatusText("✅ Kamera durch Gamemaster freigegeben.");
      if (data.status === "ready") setStatusText("⏳ Kamera bereit. Warte auf Prüfung und Freigabe.");
    };
    const onCatalog = (ids: unknown) => {
      if (Array.isArray(ids)) setApprovedIds(ids.filter((id): id is string => typeof id === "string"));
    };
    const onAdminList = (list: unknown) => {
      if (Array.isArray(list)) setAdminCameras(list.filter(
        (item): item is AdminCamera => item !== null && typeof item === "object" &&
          typeof item.id === "string" && typeof item.name === "string" &&
          ["off", "ready", "approved", "blocked"].includes(item.status) &&
          typeof item.reviewing === "boolean" && typeof item.previewSeen === "boolean"
      ));
    };
    const onViewerRemoved = (data: { viewerId: string }) => {
      if (data && typeof data.viewerId === "string") closePeer(`send:${data.viewerId}`);
    };
    const onViewerStop = (data: { cameraId: string }) => {
      if (data && typeof data.cameraId === "string") closePeer(`receive:${data.cameraId}`);
    };
    const onError = (message: unknown) => {
      if (typeof message === "string") setStatusText(message);
    };
    const onUnblocked = () => {
      setOwner("off", null);
      setStatusText("Sperre aufgehoben. Bitte Kamera neu auswählen und prüfen.");
    };
    const onDisconnect = () => {
      stopLocal(false);
      for (const key of peersRef.current.keys()) closePeer(key);
      setRemoteStreams({});
      setApprovedIds([]);
      setAdminCameras([]);
    };
    const onPageHide = () => stopLocal(true);
    const onDeviceChange = () => { void refreshDevices(); };

    socket.on("camera:signal", onSignal);
    socket.on("camera:requestViewer", onRequestViewer);
    socket.on("camera:revoke", onRevoke);
    socket.on("camera:ownerState", onOwnerState);
    socket.on("camera:catalog", onCatalog);
    socket.on("camera:admin:list", onAdminList);
    socket.on("camera:viewer:removed", onViewerRemoved);
    socket.on("camera:viewer:stop", onViewerStop);
    socket.on("camera:error", onError);
    socket.on("camera:unblocked", onUnblocked);
    socket.on("disconnect", onDisconnect);
    window.addEventListener("pagehide", onPageHide);
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    // Erste Geraeteliste asynchron laden, nicht im synchronen Effekt-Rumpf.
    void Promise.resolve().then(() => refreshDevices());
    const peers = peersRef.current;
    return () => {
      socket.off("camera:signal", onSignal);
      socket.off("camera:requestViewer", onRequestViewer);
      socket.off("camera:revoke", onRevoke);
      socket.off("camera:ownerState", onOwnerState);
      socket.off("camera:catalog", onCatalog);
      socket.off("camera:admin:list", onAdminList);
      socket.off("camera:viewer:removed", onViewerRemoved);
      socket.off("camera:viewer:stop", onViewerStop);
      socket.off("camera:error", onError);
      socket.off("camera:unblocked", onUnblocked);
      socket.off("disconnect", onDisconnect);
      window.removeEventListener("pagehide", onPageHide);
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
      stopLocal(true);
      for (const key of peers.keys()) closePeer(key);
    };
    // Socket-Handler lesen den aktuellen Verbindungszustand ausschliesslich aus Refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CameraContext.Provider value={{
      devices, deviceId, localStream, remoteStreams, approvedIds, adminCameras,
      ownerStatus, statusText, busy,
      selectDevice, refreshDevices, startPreview, stopCamera: () => stopLocal(true),
      readyForReview,
      review: (id) => socket.emit("camera:preview:start", id),
      stopReview: (id) => socket.emit("camera:preview:stop", id),
      approve: (id) => socket.emit("camera:approve", id),
      panic: (id) => socket.emit("camera:panic", id),
      panicAll: () => socket.emit("camera:panic:all"),
      unblock: (id) => socket.emit("camera:unblock", id),
    }}>
      {children}
    </CameraContext.Provider>
  );
}
