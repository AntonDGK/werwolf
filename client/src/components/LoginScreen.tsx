
import { useState } from "react";
import type { FormEvent } from "react";

type LoginMode = "player" | "gamemaster";

type LoginScreenProps = {
  connected: boolean;
  loginError: string;
  onPlayerJoin: (name: string) => void;
  onAdminLogin: (password: string) => void;
};

export default function LoginScreen({
  connected,
  loginError,
  onPlayerJoin,
  onAdminLogin,
}: LoginScreenProps) {
  const [loginMode, setLoginMode] = useState<LoginMode>("player");
  const [name, setName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!connected) return;

    if (loginMode === "gamemaster") {
      if (!adminPassword) return;

      // Das Passwort wird nur auf dem Server überprüft.
      onAdminLogin(adminPassword);
      return;
    }

    const cleanName = name.trim();

    if (!cleanName) return;

    // TODO: Hier später individuelle Spielerpasswörter ergänzen.
    // TODO: Nach erfolgreichem Login auf GM-Freigabe warten.
    onPlayerJoin(cleanName);
  };

  return (
    <section className="werwolf-panel">
      <h2>
        {loginMode === "gamemaster"
          ? "Gamemaster anmelden"
          : "Spieler beitreten"}
      </h2>

      {/* Anmeldeart auswählen */}
      <div className="login-mode-selector">
        <button
          type="button"
          aria-pressed={loginMode === "player"}
          onClick={() => {
            setLoginMode("player");
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
              placeholder="Dein Name"
              aria-label="Dein Name"
              autoComplete="nickname"
              maxLength={30}
              required
            />

            {/* TODO: Persönliches Spielerpasswort einbauen. */}
          </>
        ) : (
          <input
            type="password"
            value={adminPassword}
            onChange={(event) =>
              setAdminPassword(event.target.value)
            }
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
              : !name.trim())
          }
        >
          {loginMode === "gamemaster"
            ? "Als Gamemaster anmelden"
            : "Beitreten"}
        </button>
      </form>

      {!connected && (
        <p>Verbindung zum Server wird hergestellt …</p>
      )}

      {loginError && (
        <p role="alert" className="login-error">
          {loginError}
        </p>
      )}

      {/* TODO: Einladungssystem und sicheren Warteraum einbauen. */}
    </section>
  );
}
