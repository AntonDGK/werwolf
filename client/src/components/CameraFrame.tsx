import defaultFrame from "../assets/frames/frame-default.png";
import werewolfFrame from "../assets/frames/frame-werewolf.png";
import seerFrame from "../assets/frames/frame-seer.png";
import deadFrame from "../assets/frames/frame-dead.png";
import selectedFrame from "../assets/frames/frame-selected.png";
import blockedFrame from "../assets/frames/frame-blocked.png";
import storytellerFrame from "../assets/frames/frame-storyteller.png";
import gamemasterFrame from "../assets/frames/frame-gamemaster.png";
import "./CameraFrame.css";

export type CameraFrameKind =
  | "default"
  | "werewolf"
  | "seer"
  | "dead"
  | "blocked"
  | "storyteller"
  | "gamemaster";

const frameImages: Record<CameraFrameKind, string> = {
  default: defaultFrame,
  werewolf: werewolfFrame,
  seer: seerFrame,
  dead: deadFrame,
  blocked: blockedFrame,
  storyteller: storytellerFrame,
  gamemaster: gamemasterFrame,
};

type Props = {
  kind?: CameraFrameKind;
  selected?: boolean;
};

export default function CameraFrame({
  kind = "default",
  selected = false,
}: Props) {
  return (
    <>
      <img
        className="camera-frame__image"
        src={frameImages[kind]}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      {selected && (
        <img
          className="camera-frame__image camera-frame__selected"
          src={selectedFrame}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      )}
    </>
  );
}
