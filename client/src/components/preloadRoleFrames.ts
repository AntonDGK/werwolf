// Frame-Dateien beim Build erfassen.
const frameFiles = import.meta.glob<string>("../assets/frames/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

const priorityFrames = [
  "frame-default.png",
  "frame-blocked.png",
  "frame-dead.png",
  "frame-selected.png",
  "frame-storyteller.png",
];

const imageCache = new Map<string, HTMLImageElement>();
let started = false;

export function preloadRoleFrames(): void {
  if (started) return;
  started = true;

  const paths = Object.entries(frameFiles)
    .sort(([a], [b]) => {
      const priority = (path: string) => {
        const name = path.split("/").pop() ?? "";
        const index = priorityFrames.indexOf(name);
        return index === -1 ? priorityFrames.length : index;
      };
      return priority(a) - priority(b);
    })
    .map(([, url]) => url);

  const urls = [...new Set(paths)];
  let nextIndex = 0;

  // Nebenbei laden, ohne UI zu blockieren.
  const schedule = (work: () => void) => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(work, { timeout: 1000 });
    } else {
      window.setTimeout(work, 50);
    }
  };

  const preloadNext = () => {
    const url = urls[nextIndex++];
    if (!url) return;

    const image = new Image();
    imageCache.set(url, image);
    image.src = url;

    // Bild vor dem ersten Anzeigen dekodieren.
    void image.decode()
      .catch(() => { imageCache.delete(url); })
      .finally(() => {
        if (nextIndex < urls.length) schedule(preloadNext);
      });
  };

  if (urls.length) schedule(preloadNext);
}
