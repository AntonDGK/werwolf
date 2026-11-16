import { useSyncExternalStore } from "react";

type CameraSizeNotice = { percent: number } | null;
let current: CameraSizeNotice = null;
const subscribers = new Set<() => void>();

export function reportCameraSize(percent: number | null): void {
  const next = percent === null ? null : Math.round(percent * 10) / 10;
  if (current?.percent === next || (current === null && next === null)) return;
  current = next === null ? null : { percent: next };
  subscribers.forEach(callback => callback());
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => { subscribers.delete(callback); };
}

export function useCameraSizeNotice(): CameraSizeNotice {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
