import type { Player } from "../types/Player";
import { socket } from "../socket";
import { useState } from "react";

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

  const [color, setColor] =
    useState("red");

  return (
    <header>
      <h2>LobbyAdmin</h2>
      <input  type="text" 
              placeholder="Team Name"
              value={teamname}
              onChange={(event) => setTeamName(event.target.value)} />
      <br></br>
      {customColor ? (
        <input
          type="text"
          placeholder="#00ff00"
          value={color}
          onChange={(e) =>
            setColor(e.target.value)
          }
        />
      ) : (
        <select
          value={color}
          onChange={(e) =>
            setColor(e.target.value)
          }
        >
          <option value="red">Rot</option>
          <option value="blue">Blau</option>
          <option value="green">Grün</option>
          <option value="yellow">Gelb</option>
        </select>
      )}
      <input
        type="checkbox"
        checked={customColor}
        onChange={(e) =>
          setCustomColor(e.target.checked)
        }
      />
      {normalPlayers.map((player) => (
        <div key={player.id}>
          <span>{player.name}</span>

          <button
            onClick={() => setGm(player.id)}
          >
            GM
          </button>

          <button
            onClick={() =>
              onChangeTeam(
                player.id,
                teamname,
                color
              )
            }
          >
            Join Team 
          </button>
        </div>
      ))}
      <button
        type="button"
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