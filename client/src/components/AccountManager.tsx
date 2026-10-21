import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { socket } from "../socket";

type CreatedAccount = {
  name: string;
  password: string;
};

export default function AccountManager() {
  const [name, setName] = useState("");
  const [createdAccount, setCreatedAccount] =
    useState<CreatedAccount | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const handleCreated = (data: CreatedAccount) => {
      setLoading(false);

      if (
        typeof data?.name !== "string" ||
        typeof data?.password !== "string"
      ) {
        setStatus("Ungültige Serverantwort.");
        return;
      }

      setCreatedAccount(data);
      setName("");
      setShowPassword(false);
      setStatus("Spielerkonto erfolgreich erstellt.");
    };

    const handleError = (message: string) => {
      setLoading(false);
      setStatus(
        typeof message === "string"
          ? message
          : "Spielerkonto konnte nicht erstellt werden."
      );
    };

    const handleDisconnect = () => {
      setLoading(false);
      setCreatedAccount(null);
      setShowPassword(false);
      setStatus("Serververbindung getrennt.");
    };

    socket.on("account:created", handleCreated);
    socket.on("account:error", handleError);
    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off("account:created", handleCreated);
      socket.off("account:error", handleError);
      socket.off("disconnect", handleDisconnect);
    };
  }, []);

  const createAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const cleanName = name.trim();

    if (
      !socket.connected ||
      loading ||
      createdAccount ||
      cleanName.length < 2
    ) {
      return;
    }

    setLoading(true);
    setStatus("");

    // Nur der Server erzeugt und speichert Passwörter.
    socket.emit("account:create", cleanName);
  };

  const copyPassword = async () => {
    if (!createdAccount) return;

    try {
      await navigator.clipboard.writeText(
        createdAccount.password
      );
      setStatus("Passwort kopiert.");
    } catch {
      setStatus(
        "Kopieren fehlgeschlagen. Du kannst das Passwort einblenden."
      );
    }
  };

  const clearCredentials = () => {
    setCreatedAccount(null);
    setShowPassword(false);
    setStatus("");
  };

  return (
    <section className="account-manager">
      <h2>🔐 Spielerzugänge verwalten</h2>

      <p>
        Erstelle persönliche Zugänge für deine Mitspieler.
        Jeder Spieler erhält ein eigenes Passwort.
      </p>

      {!createdAccount ? (
        <form
          className="join-form"
          onSubmit={createAccount}
        >
          <input
            type="text"
            value={name}
            onChange={(event) =>
              setName(event.target.value)
            }
            placeholder="Name des Streamers"
            aria-label="Spielername"
            minLength={2}
            maxLength={30}
            required
          />

          <button
            type="submit"
            disabled={
              loading ||
              !socket.connected ||
              name.trim().length < 2
            }
          >
            {loading
              ? "Erstelle Zugang ..."
              : "Zugang erstellen"}
          </button>
        </form>
      ) : (
        <div className="account-result">
          <h3>Zugang erstellt: {createdAccount.name}</h3>

          <label htmlFor="created-password">
            Persönliches Passwort
          </label>

          <input
            id="created-password"
            type={showPassword ? "text" : "password"}
            value={createdAccount.password}
            readOnly
          />

          <div className="account-actions">
            <button
              type="button"
              onClick={() => void copyPassword()}
            >
              Passwort kopieren
            </button>

            <button
              type="button"
              onClick={() =>
                setShowPassword((current) => !current)
              }
            >
              {showPassword
                ? "Passwort verbergen"
                : "Passwort anzeigen"}
            </button>
          </div>

          <p>
            Gib dieses Passwort ausschließlich dem
            vorgesehenen Spieler privat weiter.
          </p>

          <button
            type="button"
            onClick={clearCredentials}
          >
            Zugangsdaten ausblenden
          </button>
        </div>
      )}

      {status && <p role="status">{status}</p>}

      <small>
        Hinweis: Die Spielerkonten werden momentan nur
        im Arbeitsspeicher des Servers gespeichert.
        Bei einem Serverneustart gehen sie verloren.
      </small>
    </section>
  );
}
