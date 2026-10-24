import { useState } from "react";
import "./RoleNotebook.css";

/** Vorerst absichtlich leer: Das Rollenlexikon wird später serverseitig gespeist. */
export default function RoleNotebook() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="role-notebook__trigger" type="button" aria-label="Rollen-Notizbuch öffnen" onClick={() => setOpen(true)}>📖 Rollen</button>
      {open && (
        <div className="role-notebook__backdrop" onClick={() => setOpen(false)}>
          <section className="role-notebook__dialog" role="dialog" aria-modal="true" aria-labelledby="role-notebook-title" onClick={(event) => event.stopPropagation()}>
            <div className="role-notebook__header">
              <h2 id="role-notebook-title">📖 Rollen-Notizbuch</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Notizbuch schließen">✕</button>
            </div>
            <p>Hier findest du später die öffentlichen Informationen zu allen Rollen.</p>
            <p className="role-notebook__hint">Noch keine Einträge vorhanden.</p>
          </section>
        </div>
      )}
    </>
  );
}
