import { socket } from "../socket";

const soundFiles = import.meta.glob<string>("../assets/sounds/*.mp3", {
  eager: true,
  query: "?url",
  import: "default",
});

const VOLUME_KEY = "werwolf:sound-volume";
const VOLUME_EVENT = "werwolf:sound-volume-changed";

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.6;
}

export function getSoundVolume(): number {
  try {
    const saved = localStorage.getItem(VOLUME_KEY);
    return saved === null ? 0.6 : clamp(Number(saved));
  } catch {
    return 0.6;
  }
}

export function setSoundVolume(volume: number): void {
  const value = clamp(volume);
  try { localStorage.setItem(VOLUME_KEY, String(value)); } catch { /* Kein Speicher */ }
  window.dispatchEvent(new Event(VOLUME_EVENT));
}

export function onSoundVolumeChange(callback: () => void): () => void {
  window.addEventListener(VOLUME_EVENT, callback);
  return () => window.removeEventListener(VOLUME_EVENT, callback);
}

export function registerGameSoundPlayer(): () => void {
  const play = (data: unknown) => {
    if (!data || typeof data !== "object") return;
    const { id, volume } = data as { id?: unknown; volume?: unknown };
    if (typeof id !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(id)) return;
    const file = soundFiles[`../assets/sounds/${id}.mp3`];
    if (!file) return;
    const audio = new Audio(file);
    audio.volume = getSoundVolume() * (typeof volume === "number" ? clamp(volume) : 1);
    void audio.play().catch(() => {});
  };
  socket.on("sound:play", play);
  return () => socket.off("sound:play", play);
}
