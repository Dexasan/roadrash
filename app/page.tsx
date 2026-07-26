import RoadRashGame from "@/components/road-rash-game"

const buildNotes = [
  ["Pseudo-3D road", "Perspective projection turns flat canvas segments into a fast, curving highway."],
  ["Real-time simulation", "Physics, rivals, traffic, combat, health, and race position update every frame."],
  ["Two input modes", "Keyboard controls on desktop and purpose-built touch controls on mobile."],
  ["Zero game engine", "The renderer and gameplay loop are written directly with React and Canvas 2D."],
]

export default function Page() {
  return (
    <main>
      <nav className="site-nav" aria-label="Main navigation">
        <a className="wordmark" href="#top"><span>RR</span> ROADRASH</a>
        <div>
          <a href="#story">The story</a>
          <a href="#build">How it works</a>
          <a className="nav-play" href="#play">Play now</a>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="speed-lines" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow">A browser tribute by Sandesh Chapagain</p>
          <h1>The game that<br/><em>started everything.</em></h1>
          <p className="hero-lead">Road Rash was the first game I ever played. The speed, the chaos, and the mystery of how a computer could create a world like that hooked me—and started a curiosity that eventually became engineering.</p>
          <div className="hero-actions">
            <a className="primary-action" href="#play">Start the race <span>↓</span></a>
            <a className="secondary-action" href="#story">Read my story</a>
          </div>
        </div>
        <div className="hero-poster" aria-label="A stylized road disappearing into a sunset">
          <div className="sun" />
          <div className="mountains left" />
          <div className="mountains right" />
          <div className="road">
            <i/><i/><i/>
          </div>
          <div className="bike-mark">01</div>
          <p><span>1990s energy</span><b>Rebuilt for the browser</b></p>
        </div>
        <div className="hero-stats">
          <span><b>Canvas 2D</b> renderer</span>
          <span><b>6</b> racers</span>
          <span><b>199 mph</b> top speed</span>
          <span><b>0</b> game engines</span>
        </div>
      </section>

      <section className="story" id="story">
        <div className="section-index">01 / ORIGIN STORY</div>
        <div className="story-grid">
          <h2>Before I knew what code was, I knew I wanted to understand <em>this.</em></h2>
          <div>
            <p>Road Rash was my first encounter with a computer game. I did not know about rendering loops, input systems, physics, or state machines. I only knew that pressing a key could make something on a screen feel alive.</p>
            <p>That feeling stayed with me. This project is not an attempt to reproduce the original game exactly. It is a small, hand-built thank-you to the experience that made computers feel less like machines and more like places where ideas could become real.</p>
            <blockquote>“The first game I played became the first reason I wanted to understand computers.”</blockquote>
          </div>
        </div>
      </section>

      <section className="play-section" id="play">
        <div className="play-heading">
          <div><p className="eyebrow">Playable in your browser</p><h2>Enough nostalgia.<br/>Take the bike.</h2></div>
          <p>Race five rivals, dodge traffic, and fight your way to the finish. Use the keyboard on desktop or the on-screen controls on mobile.</p>
        </div>
        <div className="game-frame">
          <div className="frame-bar"><span><i/> LIVE BUILD</span><b>road-rash.browser</b><small>v1.0</small></div>
          <RoadRashGame />
        </div>
      </section>

      <section className="build" id="build">
        <div className="section-index">02 / UNDER THE HOOD</div>
        <div className="build-intro">
          <h2>A tiny racing engine,<br/>built from first principles.</h2>
          <p>The interesting part is not the visual polish. It is the systems underneath: a projected track, a deterministic game loop, rival behavior, collisions, combat, and responsive controls—all running inside one browser tab.</p>
        </div>
        <div className="build-grid">{buildNotes.map(([title,copy],index)=><article key={title}><span>0{index+1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>

      <footer>
        <div><b>ROADRASH / A PERSONAL TRIBUTE</b><p>Built by Sandesh Chapagain as a tribute to the first game that made computers feel magical.</p></div>
        <a href="https://github.com/Dexasan/roadrash">View source on GitHub ↗</a>
      </footer>
    </main>
  )
}
