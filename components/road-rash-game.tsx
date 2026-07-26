"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const WIDTH = 1000
const HEIGHT = 600
const ROAD_WIDTH = 2000
const SEGMENT_LENGTH = 200
const CAMERA_HEIGHT = 1200
const CAMERA_DEPTH = 0.84
const DRAW_DISTANCE = 180
const LANES = 3
const N_SEGMENTS = 2600
const TRACK_LENGTH = N_SEGMENTS * SEGMENT_LENGTH
const FINISH = TRACK_LENGTH - DRAW_DISTANCE * SEGMENT_LENGTH

const MAX_SPEED = SEGMENT_LENGTH * 60 // units per second
const ACCEL = MAX_SPEED / 4
const BRAKING = -MAX_SPEED
const DECEL = -MAX_SPEED / 5
const OFF_ROAD_DECEL = -MAX_SPEED / 1.6
const OFF_ROAD_LIMIT = MAX_SPEED / 4
const CENTRIFUGAL = 0.32

const RIVAL_NAMES = ["Viper", "Diesel", "Skull", "Reaper", "Blitz"]

// Palette (game rendered on canvas)
const COLORS = {
  sky: "#1b1035",
  skyGlow: "#ff7a3c",
  mountain: "#2a1a4a",
  fog: "#241640",
  grassLight: "#173a2a",
  grassDark: "#123024",
  roadLight: "#3a3a44",
  roadDark: "#33333c",
  rumbleLight: "#e2e2e6",
  rumbleDark: "#b3121a",
  lane: "#e8c84a",
}

type Segment = {
  index: number
  z: number
  curve: number
  y: number
  p1: Projected
  p2: Projected
  colorIndex: number
}

type Projected = {
  wx: number
  wy: number
  wz: number
  sx: number
  sy: number
  sw: number
  scale: number
}

type Rival = {
  name: string
  z: number
  offset: number // -1..1
  speed: number
  health: number
  down: boolean
  hitFlash: number
  swingCooldown: number
  color: string
}

type Car = {
  z: number
  offset: number
  speed: number
  color: string
}

type GamePhase = "menu" | "playing" | "won" | "busted"

type Hud = {
  speed: number
  health: number
  progress: number
  rank: number
  total: number
  rivalsLeft: number
  message: string
}

function proj(): Projected {
  return { wx: 0, wy: 0, wz: 0, sx: 0, sy: 0, sw: 0, scale: 0 }
}

function buildTrack(): Segment[] {
  const segs: Segment[] = []
  for (let i = 0; i < N_SEGMENTS; i++) {
    // Smooth wandering curve + occasional sharp bends
    const curve =
      Math.sin(i * 0.012) * 2.4 +
      Math.sin(i * 0.031) * 1.6 +
      Math.sin(i * 0.003) * 3.2
    const y =
      Math.sin(i * 0.018) * 900 +
      Math.sin(i * 0.006) * 1800
    segs.push({
      index: i,
      z: i * SEGMENT_LENGTH,
      curve: i < 40 ? 0 : curve, // straight start
      y: i < 40 ? 0 : y,
      p1: proj(),
      p2: proj(),
      colorIndex: Math.floor(i / 3) % 2,
    })
  }
  return segs
}

function project(p: Projected, camX: number, camY: number, camZ: number) {
  const cameraX = p.wx - camX
  const cameraY = p.wy - camY
  const cameraZ = p.wz - camZ
  p.scale = CAMERA_DEPTH / cameraZ
  p.sx = Math.round(WIDTH / 2 + (p.scale * cameraX * WIDTH) / 2)
  p.sy = Math.round(HEIGHT / 2 - (p.scale * cameraY * HEIGHT) / 2)
  p.sw = Math.round((p.scale * ROAD_WIDTH * WIDTH) / 2)
}

function poly(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  w1: number,
  x2: number,
  y2: number,
  w2: number,
  color: string,
) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x1 - w1, y1)
  ctx.lineTo(x1 + w1, y1)
  ctx.lineTo(x2 + w2, y2)
  ctx.lineTo(x2 - w2, y2)
  ctx.closePath()
  ctx.fill()
}

export default function RoadRashGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<GamePhase>("menu")
  const [hud, setHud] = useState<Hud>({
    speed: 0,
    health: 100,
    progress: 0,
    rank: 6,
    total: 6,
    rivalsLeft: 5,
    message: "",
  })

  // Mutable game state kept in refs (avoids re-render churn)
  const phaseRef = useRef<GamePhase>("menu")
  const segsRef = useRef<Segment[]>([])
  const keys = useRef<Record<string, boolean>>({})
  const attackRef = useRef(false)

  const state = useRef({
    position: 0,
    playerX: 0,
    speed: 0,
    health: 100,
    punchTimer: 0,
    steerLean: 0,
    hitFlash: 0,
    crashTimer: 0,
    rivals: [] as Rival[],
    cars: [] as Car[],
    finished: false,
  })

  const resetGame = useCallback(() => {
    segsRef.current = buildTrack()
    const rivals: Rival[] = RIVAL_NAMES.map((name, i) => ({
      name,
      z: (i + 1) * 900 + 1600,
      offset: (i % 3) * 0.5 - 0.5,
      speed: MAX_SPEED * (0.72 + i * 0.015),
      health: 100,
      down: false,
      hitFlash: 0,
      swingCooldown: Math.random() * 2,
      color: ["#e8493b", "#3ba0e8", "#e8c84a", "#8be83b", "#e83bc8"][i],
    }))
    const cars: Car[] = []
    for (let i = 0; i < 26; i++) {
      cars.push({
        z: 3000 + i * (TRACK_LENGTH / 30) + Math.random() * 1200,
        offset: Math.random() * 1.6 - 0.8,
        speed: MAX_SPEED * (0.25 + Math.random() * 0.25),
        color: ["#c9ccd4", "#5a6070", "#c98a3b", "#7d8896"][i % 4],
      })
    }
    state.current = {
      position: 0,
      playerX: 0,
      speed: 0,
      health: 100,
      punchTimer: 0,
      steerLean: 0,
      hitFlash: 0,
      crashTimer: 0,
      rivals,
      cars,
      finished: false,
    }
  }, [])

  const startGame = useCallback(() => {
    resetGame()
    phaseRef.current = "playing"
    setPhase("playing")
  }, [resetGame])

  // Input
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) {
        e.preventDefault()
      }
      keys.current[k] = true
      if (k === " " || k === "j" || k === "f") attackRef.current = true
    }
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [])

  // Main loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let raf = 0
    let last = performance.now()
    let hudTimer = 0

    const findSeg = (z: number) =>
      segsRef.current[Math.floor(z / SEGMENT_LENGTH) % N_SEGMENTS]

    const update = (dt: number) => {
      const s = state.current
      if (phaseRef.current !== "playing") return
      const segs = segsRef.current
      const playerSeg = findSeg(s.position + CAMERA_HEIGHT)
      const speedPct = s.speed / MAX_SPEED
      const dx = dt * 2.2 * speedPct

      // Steering
      const left = keys.current["arrowleft"] || keys.current["a"]
      const right = keys.current["arrowright"] || keys.current["d"]
      const up = keys.current["arrowup"] || keys.current["w"]
      const dn = keys.current["arrowdown"] || keys.current["s"]

      s.steerLean *= 0.85
      if (left) {
        s.playerX -= dx
        s.steerLean = Math.max(-1, s.steerLean - 0.15)
      }
      if (right) {
        s.playerX += dx
        s.steerLean = Math.min(1, s.steerLean + 0.15)
      }

      // Centrifugal push through curves
      s.playerX -= dx * speedPct * playerSeg.curve * CENTRIFUGAL

      // Acceleration
      if (s.crashTimer > 0) {
        s.crashTimer -= dt
        s.speed += DECEL * 1.5 * dt
      } else if (up) {
        s.speed += ACCEL * dt
      } else if (dn) {
        s.speed += BRAKING * dt
      } else {
        s.speed += DECEL * dt
      }

      // Off-road
      if ((s.playerX < -1 || s.playerX > 1) && s.speed > OFF_ROAD_LIMIT) {
        s.speed += OFF_ROAD_DECEL * dt
      }

      s.speed = Math.max(0, Math.min(s.speed, MAX_SPEED))
      s.playerX = Math.max(-2, Math.min(2, s.playerX))
      s.position += s.speed * dt
      if (s.position >= TRACK_LENGTH) s.position -= TRACK_LENGTH

      // Punch
      let punchLanded = false
      if (attackRef.current && s.punchTimer <= 0) {
        s.punchTimer = 0.35
        punchLanded = true // one solid hit per press
      }
      attackRef.current = false
      if (s.punchTimer > 0) s.punchTimer -= dt
      if (s.hitFlash > 0) s.hitFlash -= dt

      const playerZ = s.position

      // Rivals
      let rivalsAhead = 0
      let rivalsLeft = 0
      for (const r of s.rivals) {
        if (r.hitFlash > 0) r.hitFlash -= dt
        if (r.swingCooldown > 0) r.swingCooldown -= dt

        if (r.down) {
          r.speed += DECEL * dt
          r.speed = Math.max(0, r.speed)
        } else {
          rivalsLeft++
          // AI: follow the road, wander a little
          const rSeg = findSeg(r.z + CAMERA_HEIGHT)
          r.offset -= dt * (r.speed / MAX_SPEED) * rSeg.curve * CENTRIFUGAL * 0.5
          r.offset += Math.sin(r.z * 0.001) * 0.004
          r.offset = Math.max(-0.9, Math.min(0.9, r.offset))
        }
        r.z += r.speed * dt
        if (r.z >= TRACK_LENGTH) r.z -= TRACK_LENGTH

        let dz = r.z - playerZ
        if (dz > TRACK_LENGTH / 2) dz -= TRACK_LENGTH
        if (dz < -TRACK_LENGTH / 2) dz += TRACK_LENGTH
        if (dz > 0) rivalsAhead++

        const near = Math.abs(dz) < 340 && Math.abs(r.offset - s.playerX) < 1.05
        if (near && !r.down) {
          // Player punches rival (one solid hit per press)
          if (punchLanded) {
            r.health -= 25
            r.hitFlash = 0.3
            // knock rival sideways
            r.offset += (r.offset >= s.playerX ? 1 : -1) * 0.12
            if (r.health <= 0) {
              r.health = 0
              r.down = true
              r.speed = MAX_SPEED * 0.15
            }
          }
          // Rival swings back
          if (r.swingCooldown <= 0) {
            s.health -= 9
            s.hitFlash = 0.3
            s.playerX += (s.playerX >= r.offset ? 1 : -1) * 0.15
            r.swingCooldown = 1.1
          }
        }

        // Physical bump when overlapping tightly
        if (Math.abs(dz) < 140 && Math.abs(r.offset - s.playerX) < 0.55 && !r.down) {
          s.speed *= 0.985
          if (s.speed > r.speed) {
            s.health -= 6 * dt
          }
        }
      }

      // Traffic
      for (const c of s.cars) {
        c.z += c.speed * dt
        if (c.z >= TRACK_LENGTH) {
          c.z -= TRACK_LENGTH
          c.offset = Math.random() * 1.6 - 0.8
        }
        let dz = c.z - playerZ
        if (dz > TRACK_LENGTH / 2) dz -= TRACK_LENGTH
        if (dz < -TRACK_LENGTH / 2) dz += TRACK_LENGTH
        if (Math.abs(dz) < 180 && Math.abs(c.offset - s.playerX) < 0.55) {
          if (s.crashTimer <= 0) {
            s.health -= 16
            s.hitFlash = 0.4
          }
          s.crashTimer = 0.5
          s.speed *= 0.35
        }
      }

      // Health / win / lose
      s.health = Math.max(0, s.health)
      if (s.health <= 0) {
        phaseRef.current = "busted"
        setPhase("busted")
      }
      if (playerZ >= FINISH && !s.finished) {
        s.finished = true
        phaseRef.current = "won"
        setPhase("won")
      }

      // HUD (throttled)
      hudTimer -= dt
      if (hudTimer <= 0) {
        hudTimer = 0.1
        setHud({
          speed: Math.round((s.speed / MAX_SPEED) * 199),
          health: Math.round(s.health),
          progress: Math.min(100, Math.round((playerZ / FINISH) * 100)),
          rank: rivalsAhead + 1,
          total: s.rivals.length + 1,
          rivalsLeft,
          message: "",
        })
      }
    }

    const drawSprite = (
      screenX: number,
      screenY: number,
      scale: number,
      kind: "rivalBike" | "car",
      color: string,
      flash: boolean,
      down: boolean,
    ) => {
      const w = scale * WIDTH * (kind === "car" ? 1.9 : 1.3)
      const h = w * (kind === "car" ? 0.75 : 1.15)
      const x = screenX - w / 2
      const y = screenY - h

      ctx.save()
      if (down) ctx.globalAlpha = 0.55
      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.35)"
      ctx.beginPath()
      ctx.ellipse(screenX, screenY, w * 0.5, h * 0.09, 0, 0, Math.PI * 2)
      ctx.fill()

      if (kind === "car") {
        ctx.fillStyle = color
        rr(ctx, x + w * 0.08, y + h * 0.35, w * 0.84, h * 0.55, w * 0.06)
        ctx.fillStyle = "#141821"
        rr(ctx, x + w * 0.2, y + h * 0.12, w * 0.6, h * 0.4, w * 0.05)
        ctx.fillStyle = "#e2404a"
        rr(ctx, x + w * 0.1, y + h * 0.78, w * 0.16, h * 0.12, w * 0.02)
        rr(ctx, x + w * 0.74, y + h * 0.78, w * 0.16, h * 0.12, w * 0.02)
      } else {
        // rear-view motorbike + rider
        // wheels
        ctx.fillStyle = "#0d0d12"
        ctx.beginPath()
        ctx.ellipse(screenX, y + h * 0.9, w * 0.26, h * 0.12, 0, 0, Math.PI * 2)
        ctx.fill()
        // body
        ctx.fillStyle = color
        rr(ctx, x + w * 0.3, y + h * 0.5, w * 0.4, h * 0.35, w * 0.08)
        // rider torso
        ctx.fillStyle = flash ? "#ffffff" : "#20242e"
        rr(ctx, x + w * 0.32, y + h * 0.12, w * 0.36, h * 0.46, w * 0.1)
        // helmet
        ctx.fillStyle = flash ? "#ffffff" : color
        ctx.beginPath()
        ctx.arc(screenX, y + h * 0.12, w * 0.15, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    const render = () => {
      const s = state.current
      const segs = segsRef.current
      if (segs.length === 0) {
        raf = requestAnimationFrame(loop)
        return
      }

      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT * 0.6)
      sky.addColorStop(0, COLORS.sky)
      sky.addColorStop(1, COLORS.skyGlow)
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, WIDTH, HEIGHT)

      // Sun
      ctx.fillStyle = "rgba(255,180,90,0.9)"
      ctx.beginPath()
      ctx.arc(WIDTH / 2, HEIGHT * 0.42, 90, 0, Math.PI * 2)
      ctx.fill()

      const baseIndex = Math.floor(s.position / SEGMENT_LENGTH) % N_SEGMENTS
      const basePercent = (s.position % SEGMENT_LENGTH) / SEGMENT_LENGTH
      const playerSeg = segs[baseIndex]
      const playerY =
        playerSeg.y + (segs[(baseIndex + 1) % N_SEGMENTS].y - playerSeg.y) * basePercent

      let x = 0
      let dxAcc = 0
      let maxY = HEIGHT
      const drawn: Record<number, { sx: number; sy: number; scale: number; clip: number }> = {}

      for (let n = 0; n < DRAW_DISTANCE; n++) {
        const idx = (baseIndex + n) % N_SEGMENTS
        if (baseIndex + n >= N_SEGMENTS) break // finite track, don't wrap visually
        const seg = segs[idx]
        const looped = false
        const camZ = s.position - (looped ? TRACK_LENGTH : 0)

        seg.p1.wx = 0
        seg.p1.wy = seg.y
        seg.p1.wz = seg.z
        seg.p2.wx = 0
        seg.p2.wy = segs[(idx + 1) % N_SEGMENTS].y
        seg.p2.wz = seg.z + SEGMENT_LENGTH

        project(seg.p1, s.playerX * ROAD_WIDTH - x, playerY + CAMERA_HEIGHT, camZ)
        project(seg.p2, s.playerX * ROAD_WIDTH - x - dxAcc, playerY + CAMERA_HEIGHT, camZ)

        x += dxAcc
        dxAcc += seg.curve

        if (seg.p1.wz - camZ < CAMERA_DEPTH || seg.p2.sy >= maxY || seg.p2.sy >= seg.p1.sy) {
          continue
        }

        const light = seg.colorIndex === 0
        const grass = light ? COLORS.grassLight : COLORS.grassDark
        const rumble = light ? COLORS.rumbleLight : COLORS.rumbleDark
        const road = light ? COLORS.roadLight : COLORS.roadDark

        // grass fills whole band
        ctx.fillStyle = grass
        ctx.fillRect(0, seg.p2.sy, WIDTH, seg.p1.sy - seg.p2.sy)

        // rumble strips
        const r1 = seg.p1.sw * 1.15
        const r2 = seg.p2.sw * 1.15
        poly(ctx, seg.p1.sx, seg.p1.sy, r1, seg.p2.sx, seg.p2.sy, r2, rumble)
        // road
        poly(ctx, seg.p1.sx, seg.p1.sy, seg.p1.sw, seg.p2.sx, seg.p2.sy, seg.p2.sw, road)
        // lane markers
        if (light) {
          const lw1 = (seg.p1.sw / (LANES * 2)) * 0.35
          const lw2 = (seg.p2.sw / (LANES * 2)) * 0.35
          for (let l = 1; l < LANES; l++) {
            const lx1 = seg.p1.sx - seg.p1.sw + (seg.p1.sw * 2 * l) / LANES
            const lx2 = seg.p2.sx - seg.p2.sw + (seg.p2.sw * 2 * l) / LANES
            poly(ctx, lx1, seg.p1.sy, lw1, lx2, seg.p2.sy, lw2, COLORS.lane)
          }
        }

        drawn[idx] = { sx: seg.p1.sx, sy: seg.p1.sy, scale: seg.p1.scale, clip: maxY }
        maxY = seg.p2.sy
      }

      // Sprites: draw far -> near
      type SpriteDraw = { z: number; screenX: number; screenY: number; scale: number; car: boolean; color: string; flash: boolean; down: boolean }
      const sprites: SpriteDraw[] = []
      const collect = (z: number, offset: number, car: boolean, color: string, flash: boolean, down: boolean) => {
        const idx = Math.floor(z / SEGMENT_LENGTH) % N_SEGMENTS
        const d = drawn[idx]
        if (!d) return
        const screenX = d.sx + (d.scale * offset * ROAD_WIDTH * WIDTH) / 2
        const screenY = d.sy
        if (screenY > d.clip) return
        sprites.push({ z, screenX, screenY, scale: d.scale, car, color, flash, down })
      }
      for (const c of s.cars) collect(c.z, c.offset, true, c.color, false, false)
      for (const r of s.rivals) collect(r.z, r.offset, false, r.color, r.hitFlash > 0, r.down)
      sprites.sort((a, b) => b.z - a.z)
      for (const sp of sprites) {
        drawSprite(sp.screenX, sp.screenY, sp.scale, sp.car ? "car" : "rivalBike", sp.color, sp.flash, sp.down)
      }

      // Player bike (bottom center)
      drawPlayer(ctx, s)

      // Hit flash overlay
      if (s.hitFlash > 0) {
        ctx.fillStyle = `rgba(220,40,50,${s.hitFlash * 0.5})`
        ctx.fillRect(0, 0, WIDTH, HEIGHT)
      }
    }

    const loop = (t: number) => {
      let dt = (t - last) / 1000
      last = t
      if (dt > 0.05) dt = 0.05
      update(dt)
      render()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="relative w-full max-w-4xl">
      <div className="relative overflow-hidden rounded-xl border border-border bg-black shadow-2xl">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          className="block w-full"
          style={{ imageRendering: "auto", aspectRatio: `${WIDTH} / ${HEIGHT}` }}
        />

        {/* HUD */}
        {phase === "playing" && <HudOverlay hud={hud} punch={() => (attackRef.current = true)} keys={keys} />}

        {/* Menu / results */}
        {phase !== "playing" && (
          <Overlay phase={phase} hud={hud} onStart={startGame} />
        )}
      </div>
      <ControlsLegend />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers & sub-components
// ---------------------------------------------------------------------------
function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
  ctx.fill()
}

function drawPlayer(ctx: CanvasRenderingContext2D, s: { steerLean: number; punchTimer: number }) {
  const cx = WIDTH / 2 + s.steerLean * 26
  const baseY = HEIGHT - 40
  const w = 150
  const h = 170

  ctx.save()
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)"
  ctx.beginPath()
  ctx.ellipse(WIDTH / 2, baseY + 6, 90, 14, 0, 0, Math.PI * 2)
  ctx.fill()

  const x = cx - w / 2
  const y = baseY - h

  // rear wheel
  ctx.fillStyle = "#0c0c11"
  ctx.beginPath()
  ctx.ellipse(cx, baseY - 6, 46, 20, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = "#2a2d38"
  ctx.beginPath()
  ctx.ellipse(cx, baseY - 6, 22, 9, 0, 0, Math.PI * 2)
  ctx.fill()

  // bike body
  ctx.fillStyle = "#c8342c"
  rr(ctx, x + w * 0.28, y + h * 0.5, w * 0.44, h * 0.32, 16)
  ctx.fillStyle = "#e0e2e8"
  rr(ctx, x + w * 0.3, y + h * 0.58, w * 0.4, h * 0.1, 8)

  // rider
  ctx.fillStyle = "#20242e"
  rr(ctx, x + w * 0.3, y + h * 0.14, w * 0.4, h * 0.48, 18)
  // jacket accent
  ctx.fillStyle = "#c8342c"
  rr(ctx, x + w * 0.36, y + h * 0.2, w * 0.28, h * 0.16, 10)

  // arms (extend on punch)
  ctx.strokeStyle = "#20242e"
  ctx.lineWidth = 18
  ctx.lineCap = "round"
  const punching = s.punchTimer > 0
  const armX = punching ? w * 0.62 : w * 0.5
  ctx.beginPath()
  ctx.moveTo(x + w * 0.34, y + h * 0.34)
  ctx.lineTo(x + w * (punching ? 0.86 : 0.28), y + h * (punching ? 0.28 : 0.5))
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + w * 0.66, y + h * 0.34)
  ctx.lineTo(x + w * (punching ? 0.14 : 0.72), y + h * (punching ? 0.28 : 0.5))
  ctx.stroke()

  // fist / impact
  if (punching) {
    ctx.fillStyle = "#f2c14e"
    ctx.beginPath()
    ctx.arc(x + w * 0.9, y + h * 0.26, 16, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#fff"
    ctx.font = "bold 26px system-ui"
    ctx.fillText("POW!", x + w * 0.95, y + h * 0.2)
  }

  // helmet
  ctx.fillStyle = "#c8342c"
  ctx.beginPath()
  ctx.arc(cx, y + h * 0.12, 26, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = "#12141b"
  rr(ctx, cx - 20, y + h * 0.08, 40, 14, 6)
  ctx.restore()
}

function HudOverlay({
  hud,
  punch,
  keys,
}: {
  hud: Hud
  punch: () => void
  keys: React.MutableRefObject<Record<string, boolean>>
}) {
  const hold = (k: string, v: boolean) => () => (keys.current[k] = v)
  return (
    <>
      {/* Top stats */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 font-mono text-sm">
        <div className="rounded-md bg-black/55 px-3 py-2 text-amber-300 backdrop-blur-sm">
          <div className="text-[10px] uppercase tracking-widest text-amber-200/70">Position</div>
          <div className="text-2xl font-bold leading-none">
            {hud.rank}
            <span className="text-sm text-amber-200/60">/{hud.total}</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1 rounded-md bg-black/55 px-4 py-2 backdrop-blur-sm">
          <div className="text-[10px] uppercase tracking-widest text-white/60">Race Progress</div>
          <div className="h-2 w-40 overflow-hidden rounded-full bg-white/15">
            <div className="h-full bg-amber-400" style={{ width: `${hud.progress}%` }} />
          </div>
          <div className="text-[10px] text-white/60">{hud.rivalsLeft} rivals riding</div>
        </div>

        <div className="rounded-md bg-black/55 px-3 py-2 text-right text-cyan-300 backdrop-blur-sm">
          <div className="text-[10px] uppercase tracking-widest text-cyan-200/70">Speed</div>
          <div className="text-2xl font-bold leading-none">
            {hud.speed}
            <span className="text-sm text-cyan-200/60"> mph</span>
          </div>
        </div>
      </div>

      {/* Health bar */}
      <div className="pointer-events-none absolute bottom-3 left-3 w-48 font-mono">
        <div className="mb-1 flex justify-between text-[10px] uppercase tracking-widest text-white/70">
          <span>Health</span>
          <span>{hud.health}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full border border-white/20 bg-black/50">
          <div
            className="h-full transition-[width] duration-150"
            style={{
              width: `${hud.health}%`,
              backgroundColor: hud.health > 50 ? "#4ade80" : hud.health > 25 ? "#facc15" : "#ef4444",
            }}
          />
        </div>
      </div>

      {/* Touch controls (mobile) */}
      <div className="absolute inset-x-0 bottom-0 flex select-none items-end justify-between p-3 md:hidden">
        <div className="flex gap-2">
          <TouchBtn label="◀" on={hold("arrowleft", true)} off={hold("arrowleft", false)} />
          <TouchBtn label="▶" on={hold("arrowright", true)} off={hold("arrowright", false)} />
        </div>
        <div className="flex items-end gap-2">
          <TouchBtn label="PUNCH" wide onDown={punch} />
          <TouchBtn label="BRAKE" on={hold("arrowdown", true)} off={hold("arrowdown", false)} />
          <TouchBtn label="GAS" accent on={hold("arrowup", true)} off={hold("arrowup", false)} />
        </div>
      </div>
    </>
  )
}

function TouchBtn({
  label,
  on,
  off,
  onDown,
  accent,
  wide,
}: {
  label: string
  on?: () => void
  off?: () => void
  onDown?: () => void
  accent?: boolean
  wide?: boolean
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault()
        on?.()
        onDown?.()
      }}
      onPointerUp={(e) => {
        e.preventDefault()
        off?.()
      }}
      onPointerLeave={() => off?.()}
      className={`pointer-events-auto flex ${wide ? "h-16 w-20" : "h-16 w-16"} items-center justify-center rounded-full border border-white/25 font-mono text-sm font-bold text-white backdrop-blur-sm active:scale-95 ${
        accent ? "bg-amber-500/80" : "bg-black/55"
      }`}
      aria-label={label}
    >
      {label}
    </button>
  )
}

function Overlay({
  phase,
  hud,
  onStart,
}: {
  phase: GamePhase
  hud: Hud
  onStart: () => void
}) {
  const isMenu = phase === "menu"
  const won = phase === "won"
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/70 px-6 text-center backdrop-blur-sm">
      {isMenu ? (
        <>
          <h1 className="font-mono text-4xl font-black tracking-tight text-amber-400 md:text-6xl">
            ROAD<span className="text-red-500">RASH</span>
          </h1>
          <p className="max-w-md text-pretty text-sm leading-relaxed text-white/70 md:text-base">
            Outrun and out-brawl 5 rival racers to the finish line. Pull up alongside a rider and
            throw punches to knock them off — but dodge traffic or you&apos;ll get busted.
          </p>
        </>
      ) : (
        <>
          <h1
            className={`font-mono text-4xl font-black tracking-tight md:text-6xl ${
              won ? "text-amber-400" : "text-red-500"
            }`}
          >
            {won ? "FINISH!" : "BUSTED!"}
          </h1>
          <p className="text-lg text-white/80">
            {won ? (
              <>
                You placed{" "}
                <span className="font-bold text-amber-400">
                  #{hud.rank}
                </span>{" "}
                of {hud.total} racers.
              </>
            ) : (
              "Your bike is totaled. The pack left you in the dust."
            )}
          </p>
        </>
      )}

      <button
        type="button"
        onClick={onStart}
        className="rounded-full bg-amber-500 px-8 py-3 font-mono text-base font-bold text-black transition-transform hover:scale-105 active:scale-95"
      >
        {isMenu ? "START RACE" : "RACE AGAIN"}
      </button>
    </div>
  )
}

function ControlsLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 font-mono text-xs text-muted-foreground">
      <span>
        <kbd className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">↑</kbd> Gas
      </span>
      <span>
        <kbd className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">↓</kbd> Brake
      </span>
      <span>
        <kbd className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">← →</kbd> Steer
      </span>
      <span>
        <kbd className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">Space</kbd> Punch
      </span>
    </div>
  )
}
