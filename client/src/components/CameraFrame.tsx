import "./CameraFrame.css";

// Alle PNG-Dateien automatisch erfassen.
const frames = import.meta.glob<string>("../assets/frames/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

function frameUrl(filename: string): string | undefined {
  if (!/^[a-zA-Z0-9_-]+\.png$/.test(filename)) return undefined;
  return frames[`../assets/frames/${filename}`];
}

type Props = {
  filename?: string;
  selected?: boolean;
};

export default function CameraFrame({
  filename = "frame-default.png",
  selected = false,
}: Props) {
  const src = frameUrl(filename) ?? frameUrl("frame-default.png");
  const selectedSrc = selected ? frameUrl("frame-selected.png") : undefined;

  return (
    <>
      {src && <img className="camera-frame__image" src={src}
        alt="" aria-hidden="true" draggable={false} />}
      {selectedSrc && <img className="camera-frame__image camera-frame__selected"
        src={selectedSrc} alt="" aria-hidden="true" draggable={false} />}
    </>
  );
}
