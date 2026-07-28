import "./Lobby.css";

function Lobby() {
  return (
    <header>
      <div className="lobby-loading">
        <iframe className="subway" width="225" height="500" src="https://www.youtube.com/embed/zZ7AimPACzc?si=_j-TSllPHaxCSfHf&amp;controls=0&amp;autoplay=1&amp;loop=1&amp;mute=1" 
        title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
        referrerpolicy="strict-origin-when-cross-origin" frameborder="0" allowfullscreen="false"> 
        </iframe>
        

        <iframe className="minecraft" width="281" height="500" src="https://www.youtube.com/embed/s600FYgI5-s?si=NP9xw0kp8kRP_rrD&amp;controls=0&amp;autoplay=1&amp;loop=1&amp;mute=1" 
        title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; 
        picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen="false"></iframe>

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