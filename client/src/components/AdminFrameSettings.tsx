import { useEffect, useState } from "react";
import { socket } from "../socket";
import "./AdminFrameSettings.css";

type Settings = {
  hideControllerRoleFramesDuringDay: boolean;
  blockNightOutsideOwnPhase: boolean;
};
const initial: Settings = {
  hideControllerRoleFramesDuringDay: false,
  blockNightOutsideOwnPhase: false,
};

export default function AdminFrameSettings() {
  const [settings, setSettings] = useState(initial);
  useEffect(() => {
    const onSettings = (payload: Settings) => {
      if (typeof payload?.hideControllerRoleFramesDuringDay !== "boolean" ||
          typeof payload?.blockNightOutsideOwnPhase !== "boolean") return;
      setSettings(payload);
    };
    socket.on("scene:admin-settings", onSettings);
    const request = () => socket.emit("scene:settings:request");
    socket.on("connect", request);
    request();
    return () => {
      socket.off("scene:admin-settings", onSettings);
      socket.off("connect", request);
    };
  }, []);
  const toggle = (key: keyof Settings, value: boolean) =>
    socket.emit("scene:settings:update", { [key]: value });

  return <section className="admin-frame-settings">
    <h2>🖼️ Kamerarahmen</h2>
    <label className="admin-frame-settings__option">
      <input type="checkbox" checked={settings.hideControllerRoleFramesDuringDay}
        onChange={e => toggle("hideControllerRoleFramesDuringDay", e.target.checked)} />
      <span><strong>Rollenrahmen tagsüber bei Spielleitung ausblenden</strong>
        <small>Erzähler und Gamemaster sehen Rollenrahmen standardmäßig immer. Mit Haken tagsüber nur öffentlich sichtbare Rahmen.</small></span>
    </label>
    <label className="admin-frame-settings__option">
      <input type="checkbox" checked={settings.blockNightOutsideOwnPhase}
        onChange={e => toggle("blockNightOutsideOwnPhase", e.target.checked)} />
      <span><strong>Andere Kameras nachts außerhalb der eigenen Rollenphase sperren</strong>
        <small>Während der Werwolfphase sehen lebende Werwölfe wieder alle Kameras; andere Spieler sehen gesperrte Rahmen. Erzähler und Gamemaster bleiben frei.</small></span>
    </label>
  </section>;
}
