import type { Position, VisibleAnimation } from "../AnimationTypes";

function arrowPath(source: Position, target: Position): string {
  const midX = (source.x + target.x) / 2;
  const bendY = Math.min(source.y, target.y) - Math.max(28, Math.abs(source.x - target.x) * .15);
  return `M ${source.x} ${source.y} Q ${midX} ${bendY} ${target.x} ${target.y}`;
}

export default function CupidArrow({ animation }: { animation: VisibleAnimation }) {
  return <>
    <svg className="animation-layer__canvas" width="100%" height="100%">
      {animation.targets.map((target, index) => (
        <path key={index} className="animation-layer__arrow"
          pathLength={1} d={arrowPath(animation.source, target)} />
      ))}
    </svg>
    {animation.targets.map((target, index) => (
      <span key={index} className="animation-layer__heart"
        style={{ left: target.x, top: target.y }}>♥</span>
    ))}
  </>;
}
