import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../socket";
import type { UserRole } from "../types/Types";
import type { PhaseControlStatus, PhaseControlView, PhaseControlVote } from "../components/PhaseRemotePanel";

const CHANNEL = "werwolf-phase-remote-v1";

type RemoteAction = { channel: typeof CHANNEL; type: "ready" | "advance" | "repeat" };

export function usePhaseRemoteHost(userRole: UserRole, isLoggedIn: boolean) {
  const enabled = isLoggedIn && (userRole === "gamemaster" || userRole === "storyteller");
  const popup = useRef<Window | null>(null);
  const [status, setStatus] = useState<PhaseControlStatus | null>(null);
  const [vote, setVote] = useState<PhaseControlVote | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    if (!enabled) {
      setStatus(null);
      setVote(null);
      setError("");
      return;
    }
    const onStatus = (value: PhaseControlStatus) => {
      if (value && typeof value.phase === "string" && Array.isArray(value.nightSteps)) setStatus(value);
    };
    const onVote = (value: PhaseControlVote) => {
      if (value && (value.state === "idle" || value.state === "open" || value.state === "closed")) setVote(value);
    };
    const onError = (value: string) => setError(typeof value === "string" ? value : "Steuerung fehlgeschlagen.");
    const onConnect = () => {
      setConnected(socket.connected);
      if (socket.connected) {
        socket.emit("phase:control:request");
        socket.emit("day-vote:request");
      }
    };
    const onDisconnect = () => setConnected(false);
    socket.on("phase:step:changed", onStatus);
    socket.on("day-vote:status", onVote);
    socket.on("phase:error", onError);
    socket.on("day-vote:error", onError);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    onConnect();
    return () => {
      socket.off("phase:step:changed", onStatus);
      socket.off("day-vote:status", onVote);
      socket.off("phase:error", onError);
      socket.off("day-vote:error", onError);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [enabled]);

  const view: PhaseControlView = useMemo(() => ({ status, vote, connected: enabled && connected, error }), [status, vote, connected, enabled, error]);
  const advance = useCallback(() => {
    if (!enabled || !socket.connected) return;
    setError("");
    socket.emit("phase:advance");
  }, [enabled]);
  const repeat = useCallback(() => {
    if (!enabled || !socket.connected) return;
    setError("");
    socket.emit("day-vote:repeat");
  }, [enabled]);

  const pushState = useCallback(() => {
    if (popup.current && !popup.current.closed) {
      popup.current.postMessage({ channel: CHANNEL, type: "state", view }, window.location.origin);
    }
  }, [view]);

  // Popup-Events akzeptieren wir ausschliesslich vom durch Button geoeffneten Fenster.
  useEffect(() => {
    const onMessage = (event: MessageEvent<RemoteAction>) => {
      if (event.origin !== window.location.origin || !popup.current || event.source !== popup.current) return;
      if (event.data?.channel !== CHANNEL) return;
      if (event.data.type === "ready") pushState();
      if (event.data.type === "advance") advance();
      if (event.data.type === "repeat") repeat();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pushState, advance, repeat]);

  useEffect(() => { pushState(); }, [pushState]);

  const openWindow = useCallback(() => {
    if (!enabled || userRole !== "storyteller") return;
    const url = new URL(window.location.href);
    url.searchParams.set("remote", "phases");
    const win = window.open(url.toString(), "werwolf-phasenfenster", "popup=yes,width=480,height=700,resizable=yes,scrollbars=yes");
    if (win) {
      popup.current = win;
      win.focus();
    } else {
      setError("Popup blockiert. Bitte Popups fuer diese Webseite erlauben.");
    }
  }, [enabled, userRole]);

  return { view, advance, repeat, openWindow };
}
