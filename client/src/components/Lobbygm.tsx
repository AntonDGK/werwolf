import type { Player } from "../types/Player";
import { socket } from "../socket";
import { useState } from "react";
import "./Lobbygm.css";

type LobbygmProps = {
  players: Player[];
  onChangeTeam: (
    playerId: string,
    groupName: string,
    color: string
  ) => void;
  setGm: (playerId: string) => void;
};

function Lobbygm({
  players,
  onChangeTeam,
}: LobbygmProps) {
  const normalPlayers = players.filter(
    (player) =>
      !player.isGameMaster &&
      player.name !== "Spectator"
  );

  const setGm = (playerId: string) => {
    socket.emit("setGm", playerId);
  };

  const [teamname, setTeamName] = useState("");
  const [customColor, setCustomColor] =
    useState(false);
  const [color, setColor] = useState("red");

  return (
    <header className="lobby-gm">

      <div className="lobby-gm-content">
        <section className="lobby-gm-panel lobby-gm-team-panel">
          <span className="lobby-gm-panel-label">
            Teamverwaltung
          </span>

          <h3>Team erstellen</h3>

          <label className="lobby-gm-field">
            <span>Teamname</span>

            <input
              type="text"
              placeholder="Team Name"
              value={teamname}
              onChange={(event) =>
                setTeamName(event.target.value)
              }
            />
          </label>

          <label className="lobby-gm-field">
            <span>Teamfarbe</span>

            {customColor ? (
              <input
                type="color"
                value={color}
                onChange={(event) =>
                  setColor(event.target.value)
                }
              />
            ) : (
              <select
                value={color}
                onChange={(event) =>
                  setColor(event.target.value)
                }
              >
                <option value="red">Rot</option>
                <option value="blue">Blau</option>
                <option value="green">Grün</option>
                <option value="yellow">Gelb</option>
              </select>
            )}
          </label>

          <label className="lobby-gm-custom-color">
            <input
              type="checkbox"
              checked={customColor}
              onChange={(event) =>
                setCustomColor(
                  event.target.checked
                )
              }
            />

            <span>Eigene Farbe auswählen</span>
          </label>

          <div
            className="lobby-gm-color-preview"
            style={
              {
                "--team-color":
                  color || "darkorange",
              } as React.CSSProperties
            }
          >
            Farb-Vorschau
          </div>
        </section>

        <section className="lobby-gm-panel lobby-gm-player-panel">
          <span className="lobby-gm-panel-label">
            Teilnehmer
          </span>

          <div className="lobby-gm-player-list">
            {normalPlayers.map((player) => (
              <article
                key={player.id}
                className="lobby-gm-player"
              >
                <strong className="lobby-gm-player-name">
                  {player.name}
                </strong>

                <div className="lobby-gm-player-actions">
                  <button
                    type="button"
                    className="lobby-gm-button lobby-gm-gm-button"
                    onClick={() =>
                      setGm(player.id)
                    }
                  >
                    GM
                  </button>

                  <button
                    type="button"
                    className="lobby-gm-button lobby-gm-join-button"
                    onClick={() =>
                      onChangeTeam(
                        player.id,
                        teamname,
                        color
                      )
                    }
                  >
                    Team beitreten
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <button
        type="button"
        className="lobby-gm-reset-button"
        onClick={() => {
          socket.emit("resetBoard");
        }}
      >
        Board zurücksetzen
      </button>
    </header>
  );
}

export default Lobbygm;