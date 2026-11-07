import CupidArrow from "./animations/CupidArrow";
import PlayerDeath from "./animations/PlayerDeath";
import type { JSX } from "react";
import type { VisibleAnimation, GameAnimationType } from "./AnimationTypes";

const registry = {
  "cupid-arrow": CupidArrow,
  "player-death": PlayerDeath,
} satisfies Record<GameAnimationType, (props: { animation: VisibleAnimation }) => JSX.Element>;

export function AnimationRenderer({ animation }: { animation: VisibleAnimation }) {
  const Component = registry[animation.type];
  return <Component animation={animation} />;
}
