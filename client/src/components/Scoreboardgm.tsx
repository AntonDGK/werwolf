import type { Player } from "../types/Player";
import { socket } from "../socket";

type ScoreboardgmProps = {
  players: Player[];
  pointValue: number;
  setPointValue: (value: number) => void;
  onBoard: () => void;
  onLobby: () => void;
  onNextTeam: () => void;
};

function Scoreboardgm({
  players,
  pointValue,
  setPointValue,
  onBoard,
  onLobby,
  onNextTeam
}: ScoreboardgmProps) {
  const gameMaster = players.find(
    (player) => player.isGameMaster
  );

  const normalPlayers = players.filter(
    (player) =>
      !player.isGameMaster &&
      player.name !== "Spectator"
  );

  const playersWithoutGroup =
    normalPlayers.filter(
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

  const addPointsToPlayer = (
    playerId: string
  ) => {
    if (pointValue === 0) {
      return;
    }

    socket.emit("addPointsToPlayer", {
      playerId,
      points: pointValue,
    });

    setPointValue(0);
  };

  const addPointsToGroup = (
    groupName: string
  ) => {
    if (pointValue === 0) {
      return;
    }

    socket.emit("addPointsToGroup", {
      groupName,
      points: pointValue,
    });

    setPointValue(0);
  };

  const subtractHalfPointsFromPlayer = (
    playerId: string
  ) => {
    if (pointValue === 0) {
      return;
    }

    socket.emit("addPointsToPlayer", {
      playerId,
      points: -Math.floor(pointValue / 2),
    });
  };

  const subtractHalfPointsFromGroup = (
    groupName: string
  ) => {
    if (pointValue === 0) {
      return;
    }

    socket.emit("addPointsToPlayer", {
      groupName,
      points: -Math.floor(pointValue / 2),
    });
  };

  return (
    <section>
      {gameMaster && (
        <p>
          <strong>
            {gameMaster.name}
          </strong>{" "}
          GM
        </p>
      )}

        <input
          type="number"
          value={pointValue}
          onChange={(event) => {
            setPointValue(
              Number(event.target.value)
            );
          }}
        />

      {playersWithoutGroup.map(
        (player) => (
          <div key={player.id}>
            <h3>
              {player.name} (
              {player.points})
              <button
                type="button"
                onClick={() => {
                  addPointsToPlayer(
                    player.id
                  );
                }}
              >
                +
              </button>
              <button
                type="button"
                onClick={() => {
                  subtractHalfPointsFromPlayer(
                    player.id
                  );
                }}
              >
                -
              </button>
            </h3>
          </div>
        )
      )}

      {Object.entries(groups).map(
        ([groupName, groupPlayers]) => (
          <div key={groupName}>
            <h3>
              {groupName} (
              {groupPlayers[0].points})
              <button
                type="button"
                onClick={() => {
                  addPointsToGroup(
                    groupName
                  );
                }}
              >
                +
              </button>
              <button
                type="button"
                onClick={() => {
                  subtractHalfPointsFromGroup(
                    groupName
                  );
                }}
              >
                -
              </button>
            </h3>

            {groupPlayers.map((player) => (
              <p key={player.id}>
                {player.name}
              </p>
            ))}
          </div>
        )
      )}

      <div>
        <button
          type="button"
          onClick={onLobby}
        >
          Lobby
        </button>

        <button
          type="button"
          onClick={onBoard}
        >
          Board
        </button>
        <button onClick={onNextTeam}>
          Nächstes Team
        </button>
      </div>
    </section>
  );
}

export default Scoreboardgm;