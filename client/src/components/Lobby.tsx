import { useState } from "react";
import "./Lobby.css";

function Lobby() {
  const [showVideos, setShowVideos] = useState(false);

  return (
    <header>
      <label className="switch">
        <input className="cb" type="checkbox" checked={showVideos} onChange={(e) => setShowVideos(e.target.checked)} />
        <span className="toggle">
          <span className="left">OFF</span>
          <span className="right">ADHS</span>
        </span>
      </label>


      <div className="lobby-loading">
        {showVideos && (
          <>
            <iframe
              className="subway"
              width="225"
              height="500"
              src="https://www.youtube.com/embed/zZ7AimPACzc?controls=0&autoplay=1&loop=1&mute=1"
              title="Subway"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              frameBorder={0}
            />

            <iframe
              className="minecraft"
              width="281"
              height="500"
              src="https://www.youtube.com/embed/s600FYgI5-s?controls=0&autoplay=1&loop=1&mute=1"
              title="Minecraft"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              frameBorder={0}
            />
          </>
        )}

        <div className="loadingspinner">
          <div id="square1"></div>
          <div id="square2"></div>
          <div id="square3"></div>
          <div id="square4"></div>
          <div id="square5"></div>
        </div>
      </div>
    </header>
  );
}

export default Lobby;