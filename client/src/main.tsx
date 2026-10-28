import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
const remote = new URLSearchParams(window.location.search).get("remote") === "phases";

if (remote) {
  // Wichtig: App / socket.ts hier NICHT importieren, sonst entsteht ein zweiter Login.
  void import("./components/PhaseRemoteWindow").then(({ default: PhaseRemoteWindow }) => {
    root.render(<StrictMode><PhaseRemoteWindow /></StrictMode>);
  });
} else {
  void import("./App").then(({ default: App }) => {
    root.render(<StrictMode><App /></StrictMode>);
  });
}
