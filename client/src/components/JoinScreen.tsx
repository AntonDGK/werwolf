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
      
      <br />

      <button onClick={handleJoin}>
        Join
      </button>
    </div>
  );
}

export default JoinScreen;