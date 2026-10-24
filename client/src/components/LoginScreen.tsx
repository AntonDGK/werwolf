import { useState } from "react";
import type { FormEvent } from "react";
import "./LoginScreen.css";

export type LoginMode = "player" | "gamemaster";

type LoginScreenProps = {
  connected: boolean;
  loginError: string;
  onPlayerJoin: (name: string, password: string) => void;
  onAdminLogin: (password: string) => void;
  onModeChange?: (mode: LoginMode) => void;
};

export default function LoginScreen({
  connected,
  loginError,
  onPlayerJoin,
  onAdminLogin,
  onModeChange,
}: LoginScreenProps) {
  const [loginMode, setLoginMode] = useState<LoginMode>("player");
  const [name, setName] = useState("");
  const [playerPassword, setPlayerPassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!connected) return;

    if (loginMode === "gamemaster") {
      if (!adminPassword) return;
      // Das Admin-Passwort wird ausschließlich vom Server überprüft.
      onAdminLogin(adminPassword);
      return;
    }

    const cleanName = name.trim();
    if (!cleanName || !playerPassword) return;

    // Der Server überprüft Name und persönliches Spielerpasswort.
    onPlayerJoin(cleanName, playerPassword);
  };

  return (
    <section className="werwolf-panel">
      <h2>
        {loginMode === "gamemaster"
          ? "Gamemaster anmelden"
          : "Spieler anmelden"}
      </h2>

      <div className="login-mode-selector">
        <button
          type="button"
          aria-pressed={loginMode === "player"}
          onClick={() => {
            setLoginMode("player");
            onModeChange?.("player");
            setAdminPassword("");
          }}
        >
          Spieler
        </button>

        <button
          type="button"
          aria-pressed={loginMode === "gamemaster"}
          onClick={() => {
            setLoginMode("gamemaster");
            onModeChange?.("gamemaster");
            setPlayerPassword("");
          }}
        >
          Gamemaster
        </button>
      </div>

      <form className="join-form" onSubmit={handleSubmit}>
        {loginMode === "player" ? (
          <>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Dein Spielername"
              aria-label="Spielername"
              autoComplete="username"
              minLength={2}
              maxLength={30}
              required
            />

            <input
              type="password"
              value={playerPassword}
              onChange={(event) => setPlayerPassword(event.target.value)}
              placeholder="Dein persönliches Passwort"
              aria-label="Spielerpasswort"
              autoComplete="current-password"
              required
            />
          </>
        ) : (
          <input
            type="password"
            value={adminPassword}
            onChange={(event) => setAdminPassword(event.target.value)}
            placeholder="Gamemaster-Passwort"
            aria-label="Gamemaster-Passwort"
            autoComplete="current-password"
            required
          />
        )}

        <button
          type="submit"
          disabled={
            !connected ||
            (loginMode === "gamemaster"
              ? !adminPassword
              : name.trim().length < 2 || !playerPassword)
          }
        >
          {loginMode === "gamemaster"
            ? "Als Gamemaster anmelden"
            : "Als Spieler anmelden"}
        </button>
      </form>

      {!connected && <p>Verbindung zum Server wird hergestellt …</p>}

      {loginError && (
        <p role="alert" className="login-error">
          {loginError}
        </p>
      )}

    </section>
  );
}
