import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { socket } from "../socket";
import type { GameAnimationEvent, Target, VisibleAnimation } from "./AnimationTypes";
import { AnimationRenderer } from "./AnimationRegistry";
import "./AnimationLayer.css";

function tilePosition(playerId: string): Target | null {
  const tile = Array.from(document.querySelectorAll<HTMLElement>("[data-animation-player-id]"))
    .find(element => element.dataset.animationPlayerId === playerId);
  if (!tile) return null;
  const rect = tile.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    width: rect.width,
    height: rect.height,
  };
}

function validEvent(value: unknown): value is GameAnimationEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<GameAnimationEvent>;
  return typeof event.id === "string" && event.id.length <= 100 &&
    (event.type === "cupid-arrow" || event.type === "player-death") &&
    Array.isArray(event.targetPlayerIds) && event.targetPlayerIds.length <= 10 &&
    event.targetPlayerIds.every(id => typeof id === "string") &&
    (event.sourcePlayerId === undefined || typeof event.sourcePlayerId === "string") &&
    typeof event.durationMs === "number" && Number.isFinite(event.durationMs) &&
    event.durationMs >= 200 && event.durationMs <= 10000;
}

export default function AnimationLayer() {
  const [active, setActive] = useState<VisibleAnimation[]>([]);
  const seen = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const onAnimation = (value: unknown) => {
      if (!validEvent(value) || seen.current.has(value.id)) return;
      seen.current.add(value.id);
      if (seen.current.size > 256) seen.current.clear();
      const targets = value.targetPlayerIds.map(tilePosition)
        .filter((target): target is Target => target !== null);
      if (!targets.length) return;
      const source = value.sourcePlayerId ? tilePosition(value.sourcePlayerId) : null;
      setActive(previous => [...previous, {
        ...value,
        source: source ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        targets,
      }]);
      timers.current.push(setTimeout(() => {
        setActive(previous => previous.filter(item => item.id !== value.id));
      }, value.durationMs));
    };
    socket.on("animation:play", onAnimation);
    return () => {
      socket.off("animation:play", onAnimation);
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  return (
    <div className="animation-layer" aria-hidden="true">
      {active.map(event => (
        <div key={event.id} className={`animation-layer__effect animation-layer__effect--${event.type}`}
          style={{ "--animation-duration": `${event.durationMs}ms` } as CSSProperties}>
          <AnimationRenderer animation={event} />
        </div>
      ))}
    </div>
  );
}
