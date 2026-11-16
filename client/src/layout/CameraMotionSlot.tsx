import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { CAMERA_ELLIPSE } from "./CameraEllipseLayout";
import type { CameraPoint } from "./CameraEllipseLayout";

type MotionTarget = CameraPoint & { scale: number; focused: boolean };
type MotionProps = {
  position: MotionTarget;
  width: number;
  obstacles: CameraPoint[];
  flightIndex: number;
  children: ReactNode;
  narrator?: boolean;
};

function curveControl(from: CameraPoint, to: CameraPoint, obstacles: CameraPoint[], width: number): CameraPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  if (distance < 20) return middle;
  const bend = Math.min(distance * 0.35, width * 0.09);
  const offset = { x: -dy / distance * bend, y: dx / distance * bend };
  const options = [
    middle,
    { x: middle.x + offset.x, y: middle.y + offset.y },
    { x: middle.x - offset.x, y: middle.y - offset.y },
  ];
  const clearance = (control: CameraPoint) => {
    let score = 0;
    for (const t of [0.25, 0.5, 0.75]) {
      const q = 1 - t;
      const x = q * q * from.x + 2 * q * t * control.x + t * t * to.x;
      const y = q * q * from.y + 2 * q * t * control.y + t * t * to.y;
      for (const obstacle of obstacles) {
        const dx = Math.abs(x - obstacle.x);
        const dy = Math.abs(y - obstacle.y);
        const collides = dx < width * 0.95 && dy < width * 0.65;
        score += collides ? -1000 : Math.min(Math.hypot(dx, dy), 200);
      }
    }
    return score;
  };
  return options.reduce((best, option) => clearance(option) > clearance(best) ? option : best);
}

export default function CameraMotionSlot({ position, width, obstacles, flightIndex, children, narrator = false }: MotionProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const previousRef = useRef({ ...position, width });

  useEffect(() => {
    const element = nodeRef.current;
    const from = previousRef.current;
    previousRef.current = { ...position, width };
    if (!element || narrator || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const moved = Math.hypot(position.x - from.x, position.y - from.y) > 1;
    const resized = Math.abs(position.scale - from.scale) > 0.001;
    if (!moved && !resized) return;

    element.getAnimations().forEach(animation => animation.cancel());
    const control = curveControl(from, position, obstacles, width);
    const travelScale = CAMERA_ELLIPSE.movingScale;
    const samples: Keyframe[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const q = 1 - t;
      const x = q * q * from.x + 2 * q * t * control.x + t * t * position.x;
      const y = q * q * from.y + 2 * q * t * control.y + t * t * position.y;
      const scale = t < 0.16
        ? from.scale + (travelScale - from.scale) * t / 0.16
        : t > 0.80
          ? travelScale + (position.scale - travelScale) * (t - 0.80) / 0.20
          : travelScale;
      samples.push({ offset: t, left: `${x}px`, top: `${y}px`,
        transform: `translate(-50%, -50%) scale(${scale})` });
    }
    const animation = element.animate(samples, {
      duration: CAMERA_ELLIPSE.focusDurationMs,
      delay: flightIndex * 65,
      easing: "cubic-bezier(.25,.1,.25,1)",
    });
    return () => animation.cancel();
  }, [position.x, position.y, position.scale, width, narrator]);

  const style: CSSProperties = {
    left: position.x,
    top: position.y,
    width,
    transform: `translate(-50%, -50%) scale(${position.scale})`,
    zIndex: narrator ? 12 : position.focused ? 11 : 1,
  };
  return <div ref={nodeRef} className="camera-layer__slot" style={style}>{children}</div>;
}
