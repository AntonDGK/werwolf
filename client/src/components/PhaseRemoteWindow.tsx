import { useEffect, useState } from "react";
import PhaseRemotePanel, { type PhaseControlView } from "./PhaseRemotePanel";
import RoleDistributionSettings, { type DistributionStatus, type DistributionUpdate } from "./RoleDistributionSettings";
import "./PhaseRemoteWindow.css";

const CHANNEL = "werwolf-phase-remote-v1";
const empty: PhaseControlView = { status: null, vote: null, connected: false, error: "" };

type HostMessage = { channel: typeof CHANNEL; type: "state"; view: PhaseControlView; distribution?: DistributionStatus | null };

function sendAction(type: "ready" | "advance" | "repeat" | "distribution", update?: DistributionUpdate) {
  // Popup hat absichtlich KEINE eigene Socket.IO-Verbindung / Anmeldung.
  window.opener?.postMessage({ channel: CHANNEL, type, update }, window.location.origin);
}

export default function PhaseRemoteWindow() {
  const [view, setView] = useState<PhaseControlView>(empty);
  const [distribution, setDistribution] = useState<DistributionStatus | null>(null);
  useEffect(() => {
    const onMessage = (event: MessageEvent<HostMessage>) => {
      if (event.origin !== window.location.origin || event.source !== window.opener) return;
      if (event.data?.channel === CHANNEL && event.data.type === "state") {
        setView(event.data.view);
        setDistribution(event.data.distribution ?? null);
      }
    };
    window.addEventListener("message", onMessage);
    sendAction("ready");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return <main className="phase-remote-window">
    <div className="phase-remote-window__stack">
      <PhaseRemotePanel view={view} onAdvance={() => sendAction("advance")} onRepeat={() => sendAction("repeat")} />
      <RoleDistributionSettings status={distribution} connected={view.connected}
        collapsible onChange={update => sendAction("distribution", update)} />
    </div>
  </main>;
}
