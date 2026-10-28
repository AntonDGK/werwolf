import { useEffect, useState } from "react";
import PhaseRemotePanel, { type PhaseControlView } from "./PhaseRemotePanel";
import "./PhaseRemoteWindow.css";

const CHANNEL = "werwolf-phase-remote-v1";
const empty: PhaseControlView = { status: null, vote: null, connected: false, error: "" };

type HostMessage = { channel: typeof CHANNEL; type: "state"; view: PhaseControlView };

function sendAction(type: "ready" | "advance" | "repeat") {
  // Popup hat absichtlich KEINE eigene Socket.IO-Verbindung / Anmeldung.
  window.opener?.postMessage({ channel: CHANNEL, type }, window.location.origin);
}

export default function PhaseRemoteWindow() {
  const [view, setView] = useState<PhaseControlView>(empty);
  useEffect(() => {
    const onMessage = (event: MessageEvent<HostMessage>) => {
      if (event.origin !== window.location.origin || event.source !== window.opener) return;
      if (event.data?.channel === CHANNEL && event.data.type === "state") {
        setView(event.data.view);
      }
    };
    window.addEventListener("message", onMessage);
    sendAction("ready");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return <main className="phase-remote-window">
    <PhaseRemotePanel view={view} onAdvance={() => sendAction("advance")} onRepeat={() => sendAction("repeat")} />
  </main>;
}
