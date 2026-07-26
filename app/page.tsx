import RoadRashGame from "@/components/road-rash-game"

const features = [
  ["01", "REAL RIVALS", "Five named riders fight, weave, overtake, and stay visible from the starting pack to the finish."],
  ["02", "ROAD COMBAT", "Pull alongside, land a punch, watch their health drop, and knock them out of the race."],
  ["03", "ARCADE TRAFFIC", "Read the lanes, split traffic, burn nitro, and survive a fast coast run."],
]

export default function Page() {
  return (
    <main>
      <header className="arcade-nav">
        <a href="#play" className="arcade-brand" aria-label="Roadrash home">
          <span>RR</span>
          <b>ROADRASH</b>
        </a>
        <div className="arcade-nav-meta">
          <span>ORIGINAL BROWSER TRIBUTE</span>
          <a href="#about">THE BUILD</a>
        </div>
      </header>

      <section className="arcade-hero" id="play">
        <div className="arcade-grid" aria-hidden="true" />
        <div className="arcade-heading">
          <p><i /> READY TO RIDE</p>
          <h1>THE COAST<br />DOESN&apos;T PLAY <em>FAIR.</em></h1>
          <div>
            <span>FIVE RIVALS</span>
            <span>HEAVY TRAFFIC</span>
            <span>ZERO RULES</span>
          </div>
        </div>

        <div className="arcade-cabinet">
          <div className="cabinet-top">
            <span><i /> LIVE</span>
            <b>COAST RUN / RACE 01</b>
            <small>HI-SCORE 084250</small>
          </div>
          <RoadRashGame />
        </div>
        <p className="play-note">CLICK START RACE, THEN USE YOUR KEYBOARD. TOUCH CONTROLS APPEAR ON MOBILE.</p>
      </section>

      <section className="manifesto" id="about">
        <div className="manifesto-title">
          <p>BUILT FROM THE ASPHALT UP</p>
          <h2>Not a demo.<br />A proper little <em>arcade game.</em></h2>
        </div>
        <p className="manifesto-copy">
          This is an original, non-commercial browser tribute to the motorcycle combat games that
          made 1990s computers feel dangerous and alive. The road, physics, rival AI, combat,
          traffic, and rendering are all hand-built with TypeScript and Canvas 2D.
        </p>
        <div className="feature-row">
          {features.map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="arcade-footer">
        <div><b>ROADRASH</b><span>A PERSONAL BROWSER TRIBUTE</span></div>
        <p>Built by Sandesh Chapagain</p>
        <a href="https://github.com/Dexasan/roadrash">SOURCE ↗</a>
      </footer>
    </main>
  )
}
