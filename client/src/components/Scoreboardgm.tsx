import type { CSSProperties } from "react";
import type { Player } from "../types/Player";
import { socket } from "../socket";
import "./Scoreboard.css";

type ScoreboardgmProps = {
  players: Player[];
  pointValue: number;
  setPointValue: (value: number) => void;
  onBoard: () => void;
  onLobby: () => void;
  onNextTeam: () => void;
  currentTeam: string | null;
};

function Scoreboardgm({
  players,
  pointValue,
  setPointValue,
  onBoard,
  onLobby,
  onNextTeam,
  currentTeam,
}: ScoreboardgmProps) {
  const gameMaster = players.find(
    (player) => player.isGameMaster
  );

  const normalPlayers = players.filter(
    (player) =>
      !player.isGameMaster &&
      player.name !== "Spectator"
  );

  const playersWithoutGroup = normalPlayers.filter(
    (player) => !player.group
  );

  const groups = normalPlayers.reduce<
    Record<string, Player[]>
  >((result, player) => {
    if (!player.group) {
      return result;
    }

    if (!result[player.group]) {
      result[player.group] = [];
    }

    result[player.group].push(player);

    return result;
  }, {});

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
      points: -Math.floor(
        Math.abs(pointValue) / 2
      ),
    });

    setPointValue(0);
  };

  const subtractHalfPointsFromGroup = (
    groupName: string
  ) => {
    if (pointValue === 0) {
      return;
    }

    socket.emit("addPointsToGroup", {groupName, points: -Math.floor(Math.abs(pointValue) / 2),});
  };

  return (
    <section className="scoreboard scoreboard-gm-view">
      {gameMaster && (
        <aside className="scoreboard-gm">
          <span className="scoreboard-gm-label">
            Game Master
          </span>

          <strong className="scoreboard-gm-name">
            {gameMaster.name}
          </strong>

          <span className="scoreboard-gm-description">
            Steuerung
          </span>
        </aside>
      )}

      <div className="scoreboard-entries">
        {playersWithoutGroup.map((player) => {
          const isCurrent =
            currentTeam ===
            `player:${player.id}`;

          const cardStyle = {
            "--player-color":
              player.color || "darkorange",
          } as CSSProperties;

          return (
            <article
              key={player.id}
              className="scoreboard-card"
              data-current={isCurrent}
              style={cardStyle}
            >
              <div className="scoreboard-card-inner">
                <div className="scoreboard-card-face scoreboard-card-front">
                  <span className="scoreboard-card-type">
                    Spieler
                  </span>

                  <h2 className="scoreboard-card-title">
                    {player.name}
                  </h2>

                  <div className="scoreboard-card-points">
                    ({player.points})
                  </div>


                  <div className="scoreboard-actions">
                    <button
                      type="button"
                      className="scoreboard-action-button scoreboard-action-add"
                      disabled={pointValue === 0}
                      onClick={() =>
                        addPointsToPlayer(
                          player.id
                        )
                      }
                      aria-label={`${pointValue} Punkte zu ${player.name} hinzufügen`}
                    >
                      +
                    </button>

                    <button
                      type="button"
                      className="scoreboard-action-button scoreboard-action-subtract"
                      disabled={pointValue === 0}
                      onClick={() =>
                        subtractHalfPointsFromPlayer(
                          player.id
                        )
                      }
                      aria-label={`Die Hälfte von ${pointValue} Punkten bei ${player.name} abziehen`}
                    >
                      −
                    </button>
                  </div>
                </div>

                <div className="scoreboard-card-face scoreboard-card-back">
                  <span className="scoreboard-turn-label">
                    Am Zug
                  </span>

                  <h2 className="scoreboard-card-title">
                    {player.name}
                  </h2>

                  <div className="scoreboard-card-points">
                    ({player.points})
                  </div>

                  <div className="scoreboard-actions">
                    <button
                      type="button"
                      className="scoreboard-action-button scoreboard-action-add"
                      disabled={pointValue === 0}
                      onClick={() =>
                        addPointsToPlayer(
                          player.id
                        )
                      }
                    >
                      +
                    </button>

                    <button
                      type="button"
                      className="scoreboard-action-button scoreboard-action-subtract"
                      disabled={pointValue === 0}
                      onClick={() =>
                        subtractHalfPointsFromPlayer(
                          player.id
                        )
                      }
                    >
                      −
                    </button>
                  </div>

                  <span className="scoreboard-turn-indicator">
                    Aktiver Spieler
                  </span>
                </div>
              </div>
            </article>
          );
        })}

        {Object.entries(groups).map(
          ([groupName, groupPlayers]) => {
            const isCurrent =
              currentTeam ===
              `group:${groupName}`;

            const groupPoints =
              groupPlayers[0]?.points ?? 0;

            const groupColor =
              groupPlayers[0]?.color ||
              "darkorange";

            const cardStyle = {
              "--player-color": groupColor,
            } as CSSProperties;

            return (
              <article
                key={groupName}
                className="scoreboard-card scoreboard-team-card"
                data-current={isCurrent}
                style={cardStyle}
              >
                <div className="scoreboard-card-inner">
                  <div className="scoreboard-card-face scoreboard-card-front">
                    <span className="scoreboard-card-type">
                      Team
                    </span>

                    <h2 className="scoreboard-card-title">
                      {groupName}
                    </h2>

                    <div className="scoreboard-card-points">
                      ({groupPoints})
                    </div>

                    <div className="scoreboard-members">
                      {groupPlayers.map(
                        (player) => (
                          <span
                            key={player.id}
                            className="scoreboard-member"
                          >
                            {player.name}
                          </span>
                        )
                      )}
                    </div>

                    <div className="scoreboard-actions">
                      <button
                        type="button"
                        className="scoreboard-action-button scoreboard-action-add"
                        disabled={pointValue === 0}
                        onClick={() =>
                          addPointsToGroup(
                            groupName
                          )
                        }
                        aria-label={`${pointValue} Punkte zu ${groupName} hinzufügen`}
                      >
                        +
                      </button>

                      <button
                        type="button"
                        className="scoreboard-action-button scoreboard-action-subtract"
                        disabled={pointValue === 0}
                        onClick={() =>
                          subtractHalfPointsFromGroup(
                            groupName
                          )
                        }
                        aria-label={`Die Hälfte von ${pointValue} Punkten bei ${groupName} abziehen`}
                      >
                        −
                      </button>
                    </div>
                  </div>

                  <div className="scoreboard-card-face scoreboard-card-back">
                    <span className="scoreboard-turn-label">
                      Am Zug
                    </span>

                    <h2 className="scoreboard-card-title">
                      {groupName}
                    </h2>

                    <div className="scoreboard-card-points">
                      ({groupPoints})
                    </div>


                    <div className="scoreboard-members">
                      {groupPlayers.map(
                        (player) => (
                          <span
                            key={player.id}
                            className="scoreboard-member"
                          >
                            {player.name}
                          </span>
                        )
                      )}
                    </div>

                    <div className="scoreboard-actions">
                      <button
                        type="button"
                        className="scoreboard-action-button scoreboard-action-add"
                        disabled={pointValue === 0}
                        onClick={() =>
                          addPointsToGroup(
                            groupName
                          )
                        }
                      >
                        +
                      </button>

                      <button
                        type="button"
                        className="scoreboard-action-button scoreboard-action-subtract"
                        disabled={pointValue === 0}
                        onClick={() =>
                          subtractHalfPointsFromGroup(
                            groupName
                          )
                        }
                      >
                        −
                      </button>
                    </div>

                    <span className="scoreboard-turn-indicator">
                      Aktives Team
                    </span>
                  </div>
                </div>
              </article>
            );
          }
        )}
      </div>

      <aside className="scoreboard-controls">
        <div className="scoreboard-point-control">
          <label
            className="scoreboard-control-label"
            htmlFor="scoreboard-point-value"
          >
            Punktwert
          </label>

          <input
            id="scoreboard-point-value"
            className="scoreboard-point-input"
            type="number"
            min="0"
            step="50"
            value={pointValue}
            onChange={(event) => {
              setPointValue(
                Number(event.target.value)
              );
            }}
          />

        </div>

        <div className="scoreboard-navigation">
          <button
            type="button"
            className="scoreboard-control-button"
            onClick={onLobby}
          >
            Lobby
          </button>

          <button
            type="button"
            className="scoreboard-control-button"
            onClick={onBoard}
          >
            Board
          </button>

          <button
            type="button"
            className="scoreboard-control-button scoreboard-next-button"
            onClick={onNextTeam}
          >
            Nächstes Team
          </button>
        </div>
      </aside>
    </section>
  );
}

export default Scoreboardgm;