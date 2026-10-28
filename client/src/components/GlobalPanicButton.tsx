import { useCamera } from "../camera/useCamera";
import "./CameraAdminPanel.css";

/** Globaler PANIC-Button ist absichtlich vom Freigabe-Panel getrennt. */
export default function GlobalPanicButton() {
  const camera = useCamera();
  return <section className="camera-admin">
    <h2>🚨 Allgemeiner PANIC-Button</h2>
    <button className="camera-admin__danger camera-admin__all" type="button" onClick={() => {
      if (window.confirm("ALLE Kameras sperren? Die Freigaben müssen einzeln erneuert werden.")) {
        camera.panicAll();
      }
    }}>⛔ ALLE KAMERAS SPERREN</button>
    <small>PANIC schließt Werwolf-Streams bei kooperativen Clients; externe OBS-Aufnahmen und manipulierte P2P-Clients lassen sich dadurch nicht garantiert stoppen.</small>
  </section>;
}
