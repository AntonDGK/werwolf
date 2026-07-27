import type { Player } from "../types/Player";
import "./Scoreboard.css";
type ScoreboardProps = {
  players: Player[];
  currentTeam: string | null;
};

function Scoreboard({ players, currentTeam}: ScoreboardProps) {
  const gameMaster = players.find((player) => player.isGameMaster);

  const normalPlayers = players.filter(
    (player) => !player.isGameMaster && player.name !== "Spectator"
  );

  const playersWithoutGroup = normalPlayers.filter(
    (player) => !player.group
  );

  const groups: Record<string, Player[]> = {};

  normalPlayers.forEach((player) => {
    if (!player.group) {
      return;
    }

    if (!groups[player.group]) {
      groups[player.group] = [];
    }

    groups[player.group].push(player);
  });

  return (
    <section className="scoreboard">


      {gameMaster && (
        <p className="scoreboard-gm">
          <strong>{gameMaster.name}</strong> GM
        </p>
      )}
      <div className="scoreboard-entries">
      {playersWithoutGroup.map((player) => (
        <div 
          key={player.id}
          className="scoreboard-player"
          data-current={currentTeam === `player:${player.id}`}
        >
          <h3>
            {player.name} ({player.points})
          </h3>
        </div>
      ))}

      {Object.entries(groups).map(([groupName, groupPlayers]) => (
        <div 
          key={groupName}
          className="scoreboard-group"
          data-current={currentTeam === `group:${groupName}`}>
          <h3>
            {groupName} ({groupPlayers[0].points}) 
          </h3>

          {groupPlayers.map((player) => (
            <p key={player.id}>{player.name}</p>
          ))}
        </div>
      ))}
      </div>
    </section>
  );
}

export default Scoreboard;