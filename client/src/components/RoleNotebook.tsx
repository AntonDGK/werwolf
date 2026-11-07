import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode, TouchEvent, WheelEvent } from "react";
import type { GamePhase } from "../types/Types";
import { socket } from "../socket";
import bookIcon from "../assets/icons/book-icon.png";
import { getSoundVolume, setSoundVolume, onSoundVolumeChange } from "../sounds/gameSounds";
import "./RoleNotebook.css";

type NotebookRole = { id: string; name: string; description: string };
type RoleNotebookProps = {
  phase: GamePhase;
  ownRoleId: string | null;
  isPlayer: boolean;
};

function formattedText(description: string) {
  let bold = false;
  let underline = false;
  return description.split(/(\*\*|\+\+)/g).map((part, index) => {
    if (part === "**") { bold = !bold; return null; }
    if (part === "++") { underline = !underline; return null; }
    let content: ReactNode = part;
    if (underline) content = <u>{content}</u>;
    if (bold) content = <strong>{content}</strong>;
    return <span key={index}>{content}</span>;
  });
}

export default function RoleNotebook({ phase, ownRoleId, isPlayer }: RoleNotebookProps) {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<NotebookRole[]>([]);
  const [page, setPage] = useState(0);
  const [soundOpen, setSoundOpen] = useState(false);
  const [soundVolume, setLocalSoundVolume] = useState(getSoundVolume);
  const dialogRef = useRef<HTMLElement>(null);
  const lastScroll = useRef(0);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => onSoundVolumeChange(() => setLocalSoundVolume(getSoundVolume())), []);

  useEffect(() => {
    const receive = (data: unknown) => {
      if (!Array.isArray(data)) return;
      setRoles(data.filter((entry): entry is NotebookRole =>
        entry !== null && typeof entry === "object" &&
        typeof entry.id === "string" && typeof entry.name === "string" &&
        typeof entry.description === "string"));
    };
    const request = () => socket.emit("role:notebook:request");
    socket.on("role:notebook", receive);
    socket.on("connect", request);
    request();
    return () => {
      socket.off("role:notebook", receive);
      socket.off("connect", request);
    };
  }, []);

  useEffect(() => {
    setRoles([]);
    if (phase === "role-intro" && isPlayer) setOpen(true);
    socket.emit("role:notebook:request");
  }, [phase, isPlayer]);

  useEffect(() => {
    if (!open) return;
    const ownId = isPlayer ? ownRoleId ?? "villager" : null;
    const index = roles.findIndex(role => role.id === ownId);
    setPage(index < 0 ? 0 : index);
  }, [open, roles, ownRoleId, isPlayer]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        setPage(prev => roles.length ? (prev + 1) % roles.length : 0);
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        setPage(prev => roles.length ? (prev - 1 + roles.length) % roles.length : 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, roles.length]);

  const move = (step: number) => {
    setPage(prev => roles.length ? (prev + step + roles.length) % roles.length : 0);
  };
  const onWheel = (event: WheelEvent) => {
    if (roles.length <= 1 || Math.abs(event.deltaY) < 8) return;
    const now = Date.now();
    if (now - lastScroll.current < 360) return;
    lastScroll.current = now;
    move(event.deltaY > 0 ? 1 : -1);
  };
  const onTouchStart = (event: TouchEvent) => {
    touchStartY.current = event.touches[0]?.clientY ?? null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    if (touchStartY.current === null) return;
    const difference = touchStartY.current - (event.changedTouches[0]?.clientY ?? touchStartY.current);
    touchStartY.current = null;
    if (Math.abs(difference) > 45) move(difference > 0 ? 1 : -1);
  };
  const current = roles[page];
  const ownRole = isPlayer
    ? roles.find(role => role.id === (ownRoleId ?? "villager"))
    : null;

  return (
    <>
      <button className="role-notebook__trigger" type="button" aria-label="Rollen-Notizbuch öffnen"
        title="Rollen-Notizbuch öffnen" onClick={() => { setOpen(true); socket.emit("role:notebook:request"); }}>
        <img src={bookIcon} alt="" draggable={false} />
      </button>
      {open && createPortal(
        <div className="role-notebook__backdrop" onClick={() => setOpen(false)}>
          <section ref={dialogRef} tabIndex={-1} className="role-notebook__dialog" role="dialog"
            aria-modal="true" aria-labelledby="role-notebook-title"
            onClick={event => event.stopPropagation()} onWheel={onWheel}
            onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <div className="role-notebook__header">
              <h2 id="role-notebook-title">📖 Rollen-Notizbuch</h2>
              <div className="role-notebook__header-actions">
                <button type="button" aria-label="Soundlautstärke einstellen" aria-expanded={soundOpen}
                  onClick={() => setSoundOpen(open => !open)}>🔊</button>
                <button type="button" onClick={() => setOpen(false)} aria-label="Notizbuch schließen">✕</button>
              </div>
            </div>
            {soundOpen && (
              <div className="role-notebook__volume">
                <label htmlFor="notebook-volume">Sounds: {Math.round(soundVolume * 100)} %</label>
                <input id="notebook-volume" type="range" min="0" max="100" step="5"
                  value={Math.round(soundVolume * 100)}
                  onChange={event => {
                    const next = Number(event.currentTarget.value) / 100;
                    setSoundVolume(next);
                    setLocalSoundVolume(next);
                  }} />
              </div>
            )}
            {ownRole && (
              <p className="role-notebook__own-role">
                Deine Rolle: <strong>{ownRole.name}</strong>
              </p>
            )}
            {current ? (
              <>
                <h3 className="role-notebook__role-name">{current.name}</h3>
                <div className="role-notebook__text">{formattedText(current.description)}</div>
                <nav className="role-notebook__nav" aria-label="Rollenseiten">
                  <button type="button" onClick={() => move(-1)} disabled={roles.length < 2} aria-label="Vorherige Rolle">❮</button>
                  <span>{page + 1} / {roles.length}</span>
                  <button type="button" onClick={() => move(1)} disabled={roles.length < 2} aria-label="Nächste Rolle">❯</button>
                </nav>
                <p className="role-notebook__hint">Scrollen oder wischen für weitere Rollen</p>
              </>
            ) : (
              <p className="role-notebook__hint">In dieser Runde sind noch keine Rollen verfügbar.</p>
            )}
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
