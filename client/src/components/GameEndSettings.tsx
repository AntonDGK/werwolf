import { useEffect, useState } from "react";
import { socket } from "../socket";

/** Schalter für die gesamte automatische Gewinnerkennung, nicht nur für den Neustart. */
export default function GameEndSettings() {
  const [winDetectionEnabled, setWinDetectionEnabled] = useState(true);
  useEffect(() => {
    const receive = (value: { winDetectionEnabled?: boolean }) => {
      if (typeof value?.winDetectionEnabled === "boolean") {
        setWinDetectionEnabled(value.winDetectionEnabled);
      }
    };
    const request = () => socket.emit("game:settings:request");
    socket.on("game:admin-settings", receive);
    socket.on("connect", request);
    request();
    return () => {
      socket.off("game:admin-settings", receive);
      socket.off("connect", request);
    };
  }, []);
  return <label style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:14,cursor:"pointer"}}>
    <input type="checkbox" checked={winDetectionEnabled}
      onChange={event => socket.emit("game:settings:update", { winDetectionEnabled: event.target.checked })} />
    <span><strong>Automatische Gewinnerkennung aktivieren</strong>
      <small style={{display:"block",marginTop:3,opacity:0.8}}>
        Aktiv: Nach Ausscheiden oder Nachtende wird auf Sieg geprüft; nach einem Sieg
        werden die Gewinner 10 Sekunden angezeigt und die Lobby startet neu.
        Deaktiviert: Keine Siegprüfung und kein automatisches Spielende – ideal für Tests
        und Spezialrunden ohne Werwölfe.
      </small></span>
  </label>;
}
