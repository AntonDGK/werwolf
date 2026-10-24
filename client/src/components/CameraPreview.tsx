import { useCamera } from "../camera/useCamera";
import "./CameraPreview.css";

type Props = { enabled: boolean; authenticated: boolean };

// Nur Einstellungs-UI: Kamera/Peers leben dauerhaft im CameraProvider.
export default function CameraPreview({ enabled, authenticated }: Props) {
  const camera = useCamera();
  if (!enabled) return null;

  return (
    <section className="camera-setup">
      <h2>📷 Kamera einrichten</h2>
      <p>Nur deine ausdrücklich gewählte Quelle wird geöffnet. Die eigene Vorschau ist zunächst privat.</p>
      <label htmlFor="camera-source">Kameraquelle</label>
      <select
        id="camera-source"
        value={camera.deviceId}
        onChange={(event) => camera.selectDevice(event.target.value)}
        disabled={camera.ownerStatus === "blocked"}
      >
        <option value="">Kamera auswählen</option>
        {camera.devices.map((device, index) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `Unbekannte Kamera ${index + 1} (nicht starten)`}
          </option>
        ))}
      </select>
      <div className="camera-setup__buttons">
        <button type="button" onClick={() => void camera.refreshDevices()}>Kameras aktualisieren</button>
        <button type="button" disabled={!camera.deviceId || camera.busy || !!camera.localStream || camera.ownerStatus === "blocked"}
          onClick={() => void camera.startPreview()}>
          {camera.busy ? "Kamera wird gestartet …" : "Private Vorschau öffnen"}
        </button>
        <button type="button" disabled={!camera.localStream && !camera.busy}
          onClick={camera.stopCamera}>Kamera ausschalten</button>
      </div>
      {authenticated && camera.ownerStatus === "off" && camera.localStream && (
        <div className="camera-setup__consent">
          <p>
            Du kannst deine Kamera jetzt dem Gamemaster zur <strong>privaten Prüfung</strong> anbieten.
            Nach seiner Kontrolle kann er sie für die Runde freigeben.
          </p>
          <button type="button" onClick={camera.readyForReview}>Kamera zur Prüfung anbieten</button>
        </div>
      )}
      {!authenticated && camera.localStream && (
        <p>Nach erfolgreicher Anmeldung kannst du die Kamera ausdrücklich zur Prüfung anbieten.</p>
      )}
      {camera.ownerStatus === "ready" && (
        <p>⏳ Kamera wartet auf Kontrolle und Freigabe des Gamemasters.</p>
      )}
      {camera.ownerStatus === "approved" && (
        <p>✅ Kamera freigegeben. Sie kann von den angemeldeten Teilnehmern gesehen werden.</p>
      )}
      {camera.ownerStatus === "blocked" && (
        <p role="alert">🔒 PANIC-Sperre aktiv. Erst der Gamemaster kann die erneute Einrichtung erlauben.</p>
      )}
      <p role="status">{camera.statusText}</p>
      <small>
        Das Schließen des privaten Vorschaufensters stoppt die Kamera und sämtliche Übertragungen.
        Die Kamera kann in einer OBS-Bildschirmaufnahme sichtbar werden.
        Es werden keine Kamera-IDs an den Server geschickt.
      </small>
    </section>
  );
}
