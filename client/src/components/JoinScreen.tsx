import { useState } from "react";
import "./JoinScreen.css";

type JoinScreenProps = {
  onJoin: (name: string) => void;
};

function JoinScreen({ onJoin }: JoinScreenProps) {
  const [name, setName] = useState("");

  function handleJoin() {
    if (name.trim() === "") {
      return;
    }

    onJoin(name.trim());
  }

  return (
    <div>
      <input
        className="join-input"
        type="text"
        placeholder="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <br/>

      <button className="cssbuttons-io-button" onClick={handleJoin}>
        Join
        <div className="icon">
          <svg
            height="24"
            width="24"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M0 0h24v24H0z" fill="none"></path>
            <path
              d="M16.172 11l-5.364-5.364 1.414-1.414L20 12l-7.778 7.778-1.414-1.414L16.172 13H4v-2z"
              fill="currentColor"
            ></path>
          </svg>
        </div>
      </button>
    </div>
  );
}

export default JoinScreen;