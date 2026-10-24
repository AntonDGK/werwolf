import { createContext } from "react";

export type CameraStatus = "off" | "ready" | "approved" | "blocked";

export type AdminCamera = {
  id: string;
  name: string;
  status: CameraStatus;
  reviewing: boolean;
  previewSeen: boolean;
};

export type CameraContextValue = {
  devices: MediaDeviceInfo[];
  deviceId: string;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  approvedIds: string[];
  adminCameras: AdminCamera[];
  ownerStatus: CameraStatus;
  statusText: string;
  busy: boolean;
  selectDevice: (deviceId: string) => void;
  refreshDevices: () => Promise<void>;
  startPreview: () => Promise<void>;
  stopCamera: () => void;
  readyForReview: () => void;
  review: (id: string) => void;
  stopReview: (id: string) => void;
  approve: (id: string) => void;
  panic: (id: string) => void;
  panicAll: () => void;
  unblock: (id: string) => void;
};

export const CameraContext = createContext<CameraContextValue | null>(null);
