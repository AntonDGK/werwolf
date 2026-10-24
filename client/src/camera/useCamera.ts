import { useContext } from "react";
import { CameraContext } from "./CameraContext";

export function useCamera() {
  const context = useContext(CameraContext);
  if (!context) throw new Error("CameraProvider fehlt in App.tsx");
  return context;
}
