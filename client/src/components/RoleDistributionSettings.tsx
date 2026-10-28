import { useState } from "react";
import "./RoleDistributionSettings.css";

export type DistributionUpdate =
  | { type: "enabled"; enabled: boolean }
  | { type: "count"; roleId: string; count: number };

export type DistributionStatus = {
  enabled: boolean;
  counts: Record<string, number>;
  catalog: { id: string; name: string }[];
  playerCount: number;
};

export default function RoleDistributionSettings({
  status, connected, onChange, collapsible = false,
}: {
  status: DistributionStatus | null;
  connected: boolean;
  onChange: (update: DistributionUpdate) => void;
  collapsible?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const content = (
    <div className="role-distribution__content">
      <label className="role-distribution__toggle">
        <input type="checkbox"
          checked={status?.enabled ?? false}
          disabled={!connected || !status}
          onChange={e => onChange({ type: "enabled", enabled: e.target.checked })} />
        Rollen automatisch verteilen
      </label>
      {status?.enabled && <>
        {status.catalog.map(role => {
          const count = status.counts[role.id] ?? 0;
          return <div className="role-distribution__row" key={role.id}>
            <span>{role.name}</span>
            <div className="role-distribution__counter">
              <button type="button" aria-label={`${role.name} weniger`}
                disabled={!connected || count <= 0}
                onClick={() => onChange({ type: "count", roleId: role.id, count: count - 1 })}>−</button>
              <output>{count}</output>
              <button type="button" aria-label={`${role.name} mehr`}
                disabled={!connected || count >= 100}
                onClick={() => onChange({ type: "count", roleId: role.id, count: count + 1 })}>+</button>
            </div>
          </div>;
        })}
        <div className="role-distribution__row role-distribution__villagers">
          <span>Dorfbewohner (Rest)</span>
          <strong>{Math.max(0, status.playerCount - Object.values(status.counts).reduce((sum, n) => sum + n, 0))}</strong>
        </div>
        {Object.values(status.counts).reduce((sum, n) => sum + n, 0) > status.playerCount &&
          <p className="role-distribution__error" role="alert">Zu viele Spezialrollen für {status.playerCount} Spieler.</p>}
      </>}
    </div>
  );
  return <section className="role-distribution">
    {collapsible ? <>
      <button type="button" className="role-distribution__heading"
        aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
        <span>⚙ Rollenverteilung</span><span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded && content}
    </> : content}
  </section>;
}
