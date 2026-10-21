import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { socket } from "../socket";

type AccountInfo = {
  name: string;
  online: boolean;
};

type AccountCredentials = {
  name: string;
  password: string;
};

type PendingAction = "create" | "reset" | "kick" | "delete" | null;

export default function AccountManager() {
  const [name, setName] = useState("");
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [credentials, setCredentials] = useState<AccountCredentials | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const handleAccountList = (list: unknown) => {
      if (!Array.isArray(list)) return;
      setAccounts(
        list.filter(
          (account): account is AccountInfo =>
            account !== null &&
            typeof account === "object" &&
            typeof account.name === "string" &&
            typeof account.online === "boolean"
        )
      );
    };

    const handleCreated = (data: AccountCredentials) => {
      setPending(null);
      if (typeof data?.name !== "string" || typeof data?.password !== "string") {
        setStatus("Ungültige Serverantwort.");
        return;
      }
      setCredentials(data);
      setShowPassword(false);
      setName("");
      setStatus("Zugang erstellt. Passwort jetzt privat weitergeben.");
    };

    const handleReset = (data: AccountCredentials) => {
      setPending(null);
      if (typeof data?.name !== "string" || typeof data?.password !== "string") {
        setStatus("Ungültige Serverantwort.");
        return;
      }
      setCredentials(data);
      setShowPassword(false);
      setStatus("Passwort zurückgesetzt. Das alte ist ab sofort ungültig.");
    };

    const handleError = (message: unknown) => {
      setPending(null);
      setStatus(
        typeof message === "string"
          ? message
          : "Die Aktion konnte nicht ausgeführt werden."
      );
    };

    const handleKicked = (playerName: string) => {
      setPending(null);
      setStatus(`${playerName} wurde aus der Sitzung entfernt.`);
    };

    const handleDeleted = (playerName: string) => {
      setPending(null);
      setStatus(`Zugang von ${playerName} gelöscht.`);
    };

    const handleDisconnect = () => {
      setPending(null);
      setAccounts([]);
      setCredentials(null);
      setShowPassword(false);
      setStatus("Verbindung zum Server getrennt.");
    };

    socket.on("account:list", handleAccountList);
    socket.on("account:created", handleCreated);
    socket.on("account:reset:done", handleReset);
    socket.on("account:error", handleError);
    socket.on("account:kicked", handleKicked);
    socket.on("account:deleted", handleDeleted);
    socket.on("disconnect", handleDisconnect);

    socket.emit("account:list:request");

    return () => {
      socket.off("account:list", handleAccountList);
      socket.off("account:created", handleCreated);
      socket.off("account:reset:done", handleReset);
      socket.off("account:error", handleError);
      socket.off("account:kicked", handleKicked);
      socket.off("account:deleted", handleDeleted);
      socket.off("disconnect", handleDisconnect);
    };
  }, []);

  const createAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!socket.connected || pending || credentials || cleanName.length < 2) {
      return;
    }
    setStatus("");
    setPending("create");
    socket.emit("account:create", cleanName);
  };

  const copyPassword = async () => {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(credentials.password);
      setStatus("Passwort kopiert. Bitte nur privat weitergeben.");
    } catch {
      setShowPassword(true);
      setStatus("Automatisches Kopieren nicht möglich. Passwort manuell kopieren.");
    }
  };

  const resetPassword = (playerName: string) => {
    if (pending || credentials) return;
    if (!window.confirm(`Passwort von ${playerName} zurücksetzen? Das alte Passwort wird ungültig und die aktuelle Sitzung beendet.`)) return;
    setStatus("");
    setPending("reset");
    socket.emit("account:reset", playerName);
  };

  const kickPlayer = (playerName: string) => {
    if (pending || credentials) return;
    if (!window.confirm(`${playerName} aus der aktuellen Sitzung werfen? Mit dem Passwort ist eine erneute Anmeldung möglich.`)) return;
    setStatus("");
    setPending("kick");
    socket.emit("account:kick", playerName);
  };

  const deleteAccount = (playerName: string) => {
    if (pending || credentials) return;
    if (!window.confirm(`Zugang von ${playerName} endgültig löschen? Der Spieler wird abgemeldet und kann sich nicht erneut anmelden.`)) return;
    setStatus("");
    setPending("delete");
    socket.emit("account:delete", playerName);
  };

  return (
    <section className="account-manager">
      <h2>🔐 Spielerzugänge verwalten</h2>
      <p>
        Erstelle für jeden Mitspieler einen eigenen Zugang. Bereits vergebene
        Passwörter lassen sich nicht auslesen, aber jederzeit zurücksetzen.
      </p>

      {!credentials ? (
        <form className="join-form" onSubmit={createAccount}>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name des Streamers"
            aria-label="Neuer Spielername"
            minLength={2}
            maxLength={30}
            required
          />
          <button
            type="submit"
            disabled={!socket.connected || pending !== null || name.trim().length < 2}
          >
            {pending === "create" ? "Wird erstellt …" : "Zugang erstellen"}
          </button>
        </form>
      ) : (
        <div className="account-result">
          <h3>Neue Zugangsdaten für {credentials.name}</h3>
          <p>
            Das neue Passwort wird nur jetzt angezeigt. Bitte kopiere es,
            bevor du diese Ansicht schließt. Nicht während eines Streams anzeigen.
          </p>
          <label htmlFor="generated-account-password">Passwort</label>
          <input
            id="generated-account-password"
            type={showPassword ? "text" : "password"}
            value={credentials.password}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
            style={{ display: "block", width: "100%", margin: "10px 0" }}
          />
          <div className="account-actions">
            <button type="button" onClick={() => void copyPassword()}>
              Passwort kopieren
            </button>
            <button type="button" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCredentials(null);
                setShowPassword(false);
                setStatus("");
              }}
            >
              Zugangsdaten ausblenden
            </button>
          </div>
        </div>
      )}

      {status && <p role="status">{status}</p>}

      <h3>Vorhandene Zugänge ({accounts.length})</h3>
      {accounts.length === 0 ? (
        <p>Keine Zugänge vorhanden.</p>
      ) : (
        <div className="account-list">
          {accounts.map((account) => (
            <div className="account-result" key={account.name}>
              <h4>{account.name}</h4>
              <p>Status: {account.online ? "🟢 Online" : "⚪ Offline"}</p>
              <div className="account-actions">
                <button
                  type="button"
                  disabled={pending !== null || credentials !== null}
                  onClick={() => resetPassword(account.name)}
                >
                  Passwort zurücksetzen
                </button>
                <button
                  type="button"
                  disabled={pending !== null || credentials !== null || !account.online}
                  onClick={() => kickPlayer(account.name)}
                >
                  Spieler kicken
                </button>
                <button
                  type="button"
                  disabled={pending !== null || credentials !== null}
                  onClick={() => deleteAccount(account.name)}
                >
                  Zugang löschen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p>
        <small>
          Achtung: Konten liegen momentan nur im Arbeitsspeicher des Servers
          und gehen bei einem Render-Neustart verloren. Ein Kick sperrt das
          Passwort nicht – dafür den Zugang löschen oder zurücksetzen.
        </small>
      </p>
    </section>
  );
}
