import type { Player } from "../types/Player";
import "./Scoreboard.css";

type ScoreboardProps = {
  players: Player[];
  currentTeam: string | null;
};

function Scoreboard({
  players,
  currentTeam,
}: ScoreboardProps) {
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
        <aside className="scoreboard-gm">
          <span className="scoreboard-gm-label">
            Game Master
          </span>

          <strong className="scoreboard-gm-name">
            {gameMaster.name}
          </strong>

          <span className="scoreboard-gm-description">
            Spielleitung
          </span>
        </aside>
      )}

      <div className="scoreboard-entries">
        {playersWithoutGroup.map((player) => {
          const isCurrent =
            currentTeam === `player:${player.id}`;

          return (
            <article
              key={player.id}
              className="scoreboard-card"
              data-current={isCurrent}
              style={{
                "--player-color": player.color,
              } as React.CSSProperties}
            >
              <div className="scoreboard-card-inner">
                <div className="scoreboard-card-face scoreboard-card-front">
                  <span className="scoreboard-card-type">
                    Spieler
                  </span>

                  <h3 className="scoreboard-card-title">
                    {player.name}
                  </h3>

                  <strong className="scoreboard-card-points">
                    ({player.points})
                  </strong>

                </div>

                <div className="scoreboard-card-face scoreboard-card-back">

                  <h3 className="scoreboard-card-title">
                    {player.name}
                  </h3>

                  <strong className="scoreboard-card-points">
                    ({player.points})
                  </strong>

                  <span className="scoreboard-turn-indicator">
                    Am Zug
                  </span>
                </div>
              </div>
            </article>
          );
        })}

        {Object.entries(groups).map(
          ([groupName, groupPlayers]) => {
            const isCurrent =
              currentTeam === `group:${groupName}`;

            const groupPoints =
              groupPlayers[0]?.points ?? 0;

            return (
              <article
                key={groupName}
                className="scoreboard-card scoreboard-team-card"
                data-current={isCurrent}
                style={{
                  "--player-color": groupPlayers[0].color,
                } as React.CSSProperties}
              >
                <div className="scoreboard-card-inner">
                  <div className="scoreboard-card-face scoreboard-card-front">
                    <span className="scoreboard-card-type">
                      Team
                    </span>

                    <h3 className="scoreboard-card-title">
                      {groupName}
                    </h3>

                    <strong className="scoreboard-card-points">
                      ({groupPoints})
                    </strong>

                    <div className="scoreboard-members">
                      {groupPlayers.map((player) => (
                        <span
                          key={player.id}
                          className="scoreboard-member"
                        >
                          {player.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="scoreboard-card-face scoreboard-card-back">

                    <h3 className="scoreboard-card-title">
                      {groupName}
                    </h3>

                    <strong className="scoreboard-card-points">
                      ({groupPoints})
                    </strong>


                    <div className="scoreboard-members">
                      {groupPlayers.map((player) => (
                        <span
                          key={player.id}
                          className="scoreboard-member"
                        >
                          {player.name}
                        </span>
                      ))}
                    </div>

                    <span className="scoreboard-turn-indicator">
                      Am Zug
                    </span>
                  </div>
                </div>
              </article>
            );
          }
        )}
      </div>
    </section>
  );
}

export default Scoreboard;