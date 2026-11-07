import type { VisibleAnimation } from "../AnimationTypes";

export default function PlayerDeath({ animation }: { animation: VisibleAnimation }) {
  return <>
    {animation.targets.map((target, index) => (
      <div key={index} className="animation-layer__death"
        style={{ left: target.x - target.width / 2, top: target.y - target.height / 2,
          width: target.width, height: target.height }}>
        <span>☠</span>
      </div>
    ))}
  </>;
}
