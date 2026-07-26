"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const VIEW_W = 1280
const VIEW_H = 720
const ROAD_WIDTH = 2200
const SEGMENT_LENGTH = 200
const SEGMENT_COUNT = 1550
const TRACK_LENGTH = SEGMENT_COUNT * SEGMENT_LENGTH
const DRAW_DISTANCE = 250
const CAMERA_HEIGHT = 1120
const CAMERA_DEPTH = 0.9
const MAX_SPEED = 12_800
const MAX_HEALTH = 150
const PLAYER_Z = 900
const LANES = 3

const RIVAL_DATA = [
  ["AXEL", "#ffca3a"],
  ["VIPER", "#4cc9f0"],
  ["RIPPER", "#ef476f"],
  ["NITRO", "#80ed99"],
  ["SLASH", "#c77dff"],
] as const

type Phase = "menu" | "countdown" | "racing" | "finished" | "wrecked"
type Keys = Record<string, boolean>

type TrackSegment = {
  index: number
  z: number
  y: number
  curve: number
}

type Rider = {
  name: string
  z: number
  lane: number
  speed: number
  targetSpeed: number
  health: number
  color: string
  weave: number
  attackCooldown: number
  hitTimer: number
  crashed: number
}

type Traffic = {
  z: number
  lane: number
  speed: number
  color: string
  type: "car" | "van"
  previousDz: number
  hitCooldown: number
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
}

type ScreenPoint = {
  x: number
  y: number
  road: number
  scale: number
  visible: boolean
}

type Hud = {
  speed: number
  health: number
  progress: number
  rank: number
  countdown: number
  message: string
  rival: string
  rivalHealth: number
  nitro: number
}

type Simulation = {
  position: number
  playerX: number
  speed: number
  health: number
  nitro: number
  lean: number
  attack: number
  attackSide: -1 | 1
  hit: number
  shake: number
  invulnerable: number
  countdown: number
  raceTime: number
  message: string
  messageTimer: number
  rivals: Rider[]
  traffic: Traffic[]
  particles: Particle[]
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

const approach = (value: number, target: number, amount: number) =>
  value < target ? Math.min(target, value + amount) : Math.max(target, value - amount)

function buildTrack(): TrackSegment[] {
  const segments: TrackSegment[] = []
  let elevation = 0

  for (let i = 0; i < SEGMENT_COUNT; i++) {
    let curve = 0
    const section = i % 310
    if (section > 45 && section < 105) curve = Math.sin(((section - 45) / 60) * Math.PI) * 2.6
    if (section > 145 && section < 225) curve = -Math.sin(((section - 145) / 80) * Math.PI) * 3.5
    if (section > 255) curve = Math.sin(((section - 255) / 55) * Math.PI) * 1.7
    if (i < 35 || i > SEGMENT_COUNT - 45) curve = 0

    const hillTarget =
      Math.sin(i * 0.017) * 520 +
      Math.sin(i * 0.0065) * 920 +
      (i > 820 && i < 1030 ? Math.sin(((i - 820) / 210) * Math.PI) * 1100 : 0)
    elevation = approach(elevation, hillTarget, 34)

    segments.push({ index: i, z: i * SEGMENT_LENGTH, y: elevation, curve })
  }
  return segments
}

function makeSimulation(): Simulation {
  const rivals: Rider[] = RIVAL_DATA.map(([name, color], index) => ({
    name,
    color,
    z: 3_100 + index * 1_050,
    lane: [-0.62, 0.48, -0.08, 0.7, -0.74][index],
    speed: MAX_SPEED * (0.7 + index * 0.023),
    targetSpeed: MAX_SPEED * (0.78 + index * 0.025),
    health: 100,
    weave: index * 1.7,
    attackCooldown: 1 + index * 0.3,
    hitTimer: 0,
    crashed: 0,
  }))

  const traffic: Traffic[] = Array.from({ length: 34 }, (_, index) => ({
    z: 10_000 + index * 7_900 + (index % 4) * 850,
    lane: [-0.67, 0.02, 0.65, -0.22][index % 4],
    speed: MAX_SPEED * (0.3 + (index % 5) * 0.035),
    color: ["#d8dee9", "#d1495b", "#277da1", "#f4a261", "#7f8c8d"][index % 5],
    type: index % 6 === 0 ? "van" : "car",
    previousDz: 10_000 + index * 7_900 + (index % 4) * 850 - PLAYER_Z,
    hitCooldown: 0,
  }))

  return {
    position: 0,
    playerX: 0,
    speed: 0,
    health: MAX_HEALTH,
    nitro: 100,
    lean: 0,
    attack: 0,
    attackSide: 1,
    hit: 0,
    shake: 0,
    invulnerable: 0,
    countdown: 3.65,
    raceTime: 0,
    message: "GET READY",
    messageTimer: 1,
    rivals,
    traffic,
    particles: [],
  }
}

function quad(
  ctx: CanvasRenderingContext2D,
  nearX: number,
  nearY: number,
  nearW: number,
  farX: number,
  farY: number,
  farW: number,
  color: string,
) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(nearX - nearW, nearY)
  ctx.lineTo(nearX + nearW, nearY)
  ctx.lineTo(farX + farW, farY)
  ctx.lineTo(farX - farW, farY)
  ctx.closePath()
  ctx.fill()
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, radius)
  ctx.fill()
}

function ordinal(value: number) {
  if (value === 1) return "1ST"
  if (value === 2) return "2ND"
  if (value === 3) return "3RD"
  return `${value}TH`
}

export default function RoadRashGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const keysRef = useRef<Keys>({})
  const phaseRef = useRef<Phase>("menu")
  const trackRef = useRef<TrackSegment[]>(buildTrack())
  const simRef = useRef<Simulation>(makeSimulation())
  const attackQueuedRef = useRef(false)
  const [phase, setPhase] = useState<Phase>("menu")
  const [hud, setHud] = useState<Hud>({
    speed: 0,
    health: MAX_HEALTH,
    progress: 0,
    rank: 6,
    countdown: 3,
    message: "",
    rival: "",
    rivalHealth: 100,
    nitro: 100,
  })

  const changePhase = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const startRace = useCallback(() => {
    simRef.current = makeSimulation()
    attackQueuedRef.current = false
    setHud({
      speed: 0,
      health: MAX_HEALTH,
      progress: 0,
      rank: 6,
      countdown: 3,
      message: "GET READY",
      rival: "",
      rivalHealth: 100,
      nitro: 100,
    })
    changePhase("countdown")
  }, [changePhase])

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "shift"].includes(key)) {
        event.preventDefault()
      }
      keysRef.current[key] = true
      if (key === " " || key === "j" || key === "f") attackQueuedRef.current = true
      if ((key === "enter" || key === " ") && phaseRef.current !== "racing" && phaseRef.current !== "countdown") {
        startRace()
      }
    }
    const onUp = (event: KeyboardEvent) => {
      keysRef.current[event.key.toLowerCase()] = false
    }
    const onBlur = () => {
      keysRef.current = {}
    }
    window.addEventListener("keydown", onDown, { passive: false })
    window.addEventListener("keyup", onUp)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("keydown", onDown)
      window.removeEventListener("keyup", onUp)
      window.removeEventListener("blur", onBlur)
    }
  }, [startRace])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const track = trackRef.current
    const screen: ScreenPoint[] = Array.from({ length: DRAW_DISTANCE + 2 }, () => ({
      x: 0,
      y: 0,
      road: 0,
      scale: 0,
      visible: false,
    }))
    let frame = 0
    let previous = performance.now()
    let hudClock = 0

    const setMessage = (sim: Simulation, message: string, seconds = 1.1) => {
      sim.message = message
      sim.messageTimer = seconds
    }

    const burst = (sim: Simulation, x: number, y: number, color: string, amount = 10) => {
      for (let i = 0; i < amount; i++) {
        sim.particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 360,
          vy: -70 - Math.random() * 250,
          life: 0.35 + Math.random() * 0.35,
          color,
        })
      }
    }

    const relativeScreen = (z: number, lane: number) => {
      const baseIndex = Math.floor(simRef.current.position / SEGMENT_LENGTH)
      const relative = z / SEGMENT_LENGTH - baseIndex
      const index = Math.floor(relative)
      if (index < 1 || index >= DRAW_DISTANCE - 1) return null
      const a = screen[index]
      const b = screen[index + 1]
      if (!a?.visible || !b?.visible) return null
      const t = relative - index
      const center = a.x + (b.x - a.x) * t
      const y = a.y + (b.y - a.y) * t
      const road = a.road + (b.road - a.road) * t
      return { x: center + road * lane, y, road, scale: a.scale + (b.scale - a.scale) * t }
    }

    const attack = (sim: Simulation) => {
      if (sim.attack > 0) return
      let target: Rider | undefined
      let best = Number.POSITIVE_INFINITY
      for (const rival of sim.rivals) {
        if (rival.crashed > 0) continue
        const dz = rival.z - sim.position
        const laneGap = Math.abs(rival.lane - sim.playerX)
        const score = Math.abs(dz - PLAYER_Z) + laneGap * 900
        if (Math.abs(dz - PLAYER_Z) < 680 && laneGap < 0.72 && score < best) {
          target = rival
          best = score
        }
      }
      sim.attack = 0.38
      if (!target) {
        sim.attackSide = sim.playerX > 0 ? 1 : -1
        return
      }
      sim.attackSide = target.lane >= sim.playerX ? 1 : -1
      target.health = Math.max(0, target.health - 28)
      target.hitTimer = 0.35
      target.lane = clamp(target.lane + sim.attackSide * 0.16, -1.05, 1.05)
      const point = relativeScreen(target.z, target.lane)
      if (point) burst(sim, point.x, point.y - point.road * 0.18, "#ffe66d", 14)
      if (target.health <= 0) {
        target.crashed = 3.2
        target.speed *= 0.18
        setMessage(sim, `${target.name} WIPED OUT!`, 1.5)
      } else {
        setMessage(sim, "GOOD HIT!", 0.7)
      }
    }

    const update = (dt: number) => {
      const sim = simRef.current
      const phaseNow = phaseRef.current
      const keys = keysRef.current

      if (sim.messageTimer > 0) sim.messageTimer -= dt
      if (sim.attack > 0) sim.attack -= dt
      if (sim.hit > 0) sim.hit -= dt
      if (sim.shake > 0) sim.shake -= dt
      if (sim.invulnerable > 0) sim.invulnerable -= dt
      for (const particle of sim.particles) {
        particle.life -= dt
        particle.x += particle.vx * dt
        particle.y += particle.vy * dt
        particle.vy += 620 * dt
      }
      sim.particles = sim.particles.filter((particle) => particle.life > 0)

      if (phaseNow === "menu" || phaseNow === "finished" || phaseNow === "wrecked") return

      if (phaseNow === "countdown") {
        sim.countdown -= dt
        sim.speed = approach(sim.speed, MAX_SPEED * 0.12, MAX_SPEED * dt * 0.08)
        hudClock -= dt
        if (hudClock <= 0) {
          hudClock = 0.08
          setHud((current) => ({
            ...current,
            speed: Math.round((sim.speed / MAX_SPEED) * 198),
            countdown: Math.max(0, Math.ceil(sim.countdown)),
            message: sim.messageTimer > 0 ? sim.message : "",
          }))
        }
        if (sim.countdown <= 0) {
          sim.countdown = 0
          setMessage(sim, "RIDE!", 0.9)
          changePhase("racing")
        }
        return
      }

      sim.raceTime += dt
      const gas = keys.arrowup || keys.w
      const brake = keys.arrowdown || keys.s
      const left = keys.arrowleft || keys.a
      const right = keys.arrowright || keys.d
      const boosting = (keys.shift || keys.k) && sim.nitro > 0 && gas
      const speedRatio = sim.speed / MAX_SPEED

      if (gas) sim.speed += MAX_SPEED * 0.31 * dt
      else sim.speed -= MAX_SPEED * 0.12 * dt
      if (brake) sim.speed -= MAX_SPEED * 0.62 * dt
      if (boosting) {
        sim.speed += MAX_SPEED * 0.42 * dt
        sim.nitro = Math.max(0, sim.nitro - 24 * dt)
      } else {
        sim.nitro = Math.min(100, sim.nitro + 4.5 * dt)
      }

      const baseIndex = clamp(Math.floor(sim.position / SEGMENT_LENGTH), 0, SEGMENT_COUNT - 1)
      const currentCurve = track[baseIndex].curve
      const steer = (right ? 1 : 0) - (left ? 1 : 0)
      sim.playerX += steer * dt * (1.2 + speedRatio * 1.65)
      sim.playerX -= currentCurve * 0.19 * speedRatio * dt
      sim.lean = approach(sim.lean, steer, dt * 6)
      if (!steer) sim.lean = approach(sim.lean, 0, dt * 4)

      if (Math.abs(sim.playerX) > 0.98) {
        sim.speed -= MAX_SPEED * 0.34 * dt
        sim.shake = Math.max(sim.shake, 0.08)
      }
      sim.playerX = clamp(sim.playerX, -1.28, 1.28)
      sim.speed = clamp(sim.speed, 0, boosting ? MAX_SPEED * 1.13 : MAX_SPEED)
      sim.position += sim.speed * dt

      if (attackQueuedRef.current) {
        attackQueuedRef.current = false
        attack(sim)
      }

      for (const rival of sim.rivals) {
        if (rival.hitTimer > 0) rival.hitTimer -= dt
        if (rival.attackCooldown > 0) rival.attackCooldown -= dt
        if (rival.crashed > 0) {
          rival.crashed -= dt
          rival.speed = Math.max(0, rival.speed - MAX_SPEED * 0.45 * dt)
          continue
        }

        const catchUp = rival.z < sim.position - 4_000 ? MAX_SPEED * 0.12 : 0
        rival.speed = approach(rival.speed, rival.targetSpeed + catchUp, MAX_SPEED * 0.055 * dt)
        rival.z += rival.speed * dt
        rival.weave += dt * (0.8 + rival.speed / MAX_SPEED)
        rival.lane += Math.sin(rival.weave) * dt * 0.075
        rival.lane = clamp(rival.lane, -0.88, 0.88)

        const dz = rival.z - sim.position - PLAYER_Z
        const laneGap = Math.abs(rival.lane - sim.playerX)
        if (Math.abs(dz) < 420 && laneGap < 0.48) {
          sim.speed *= 1 - dt * 0.42
          rival.speed *= 1 - dt * 0.18
          sim.playerX += (sim.playerX <= rival.lane ? -1 : 1) * dt * 0.35
        }
        if (
          Math.abs(dz) < 520 &&
          laneGap < 0.58 &&
          rival.attackCooldown <= 0 &&
          sim.invulnerable <= 0
        ) {
          sim.health = Math.max(0, sim.health - 8)
          sim.hit = 0.35
          sim.shake = 0.3
          sim.invulnerable = 0.42
          sim.playerX += (sim.playerX <= rival.lane ? -1 : 1) * 0.13
          rival.attackCooldown = 2.1 + Math.random()
          setMessage(sim, `${rival.name} HIT YOU`, 0.8)
        }
      }

      for (const car of sim.traffic) {
        if (car.hitCooldown > 0) car.hitCooldown -= dt
        const previousDz = car.previousDz
        car.z += car.speed * dt
        let dz = car.z - sim.position - PLAYER_Z
        if (dz < -6_000) {
          car.z = sim.position + 42_000 + Math.random() * 35_000
          car.lane = [-0.66, 0, 0.66][Math.floor(Math.random() * 3)]
          car.previousDz = car.z - sim.position - PLAYER_Z
          car.hitCooldown = 0
          continue
        }
        const halfDepth = car.type === "van" ? 175 : 145
        const lateralHitbox = car.type === "van" ? 0.27 : 0.235
        const sweptThroughPlayer =
          Math.min(previousDz, dz) <= halfDepth &&
          Math.max(previousDz, dz) >= -halfDepth
        const bodiesOverlap =
          sweptThroughPlayer &&
          Math.abs(car.lane - sim.playerX) < lateralHitbox
        if (bodiesOverlap && car.hitCooldown <= 0 && sim.invulnerable <= 0) {
          sim.health = Math.max(0, sim.health - 14)
          sim.speed *= 0.58
          sim.hit = 0.42
          sim.shake = 0.46
          sim.invulnerable = 0.85
          car.hitCooldown = 1.25
          sim.playerX += sim.playerX <= car.lane ? -0.18 : 0.18
          car.z += 520
          dz = car.z - sim.position - PLAYER_Z
          setMessage(sim, "TRAFFIC HIT!", 0.8)
          burst(sim, VIEW_W / 2, VIEW_H * 0.74, "#ffb703", 14)
        }
        car.previousDz = dz
      }

      if (sim.health <= 0) {
        sim.speed *= 0.25
        changePhase("wrecked")
      } else if (sim.position >= TRACK_LENGTH - DRAW_DISTANCE * SEGMENT_LENGTH) {
        sim.position = TRACK_LENGTH - DRAW_DISTANCE * SEGMENT_LENGTH
        changePhase("finished")
      }

      hudClock -= dt
      if (hudClock <= 0) {
        hudClock = 0.08
        const sorted = [...sim.rivals].sort((a, b) => b.z - a.z)
        const nearby = sorted.find(
          (rival) => rival.crashed <= 0 && Math.abs(rival.z - sim.position - PLAYER_Z) < 4_600,
        )
        setHud({
          speed: Math.round((sim.speed / MAX_SPEED) * 198),
          health: Math.round(sim.health),
          progress: Math.round(clamp(sim.position / (TRACK_LENGTH - DRAW_DISTANCE * SEGMENT_LENGTH), 0, 1) * 100),
          rank: 1 + sim.rivals.filter((rival) => rival.z > sim.position + PLAYER_Z).length,
          countdown: Math.ceil(sim.countdown),
          message: sim.messageTimer > 0 ? sim.message : "",
          rival: nearby?.name ?? "",
          rivalHealth: nearby?.health ?? 100,
          nitro: Math.round(sim.nitro),
        })
      }
    }

    const projectRoad = (sim: Simulation) => {
      const base = clamp(Math.floor(sim.position / SEGMENT_LENGTH), 0, SEGMENT_COUNT - DRAW_DISTANCE - 2)
      const baseY = track[base].y
      let curveX = 0
      let curveDx = 0

      for (let n = 0; n <= DRAW_DISTANCE + 1; n++) {
        const segment = track[base + n]
        const dz = segment.z - sim.position
        const point = screen[n]
        if (dz <= CAMERA_DEPTH) {
          point.visible = false
          continue
        }
        const scale = CAMERA_DEPTH / dz
        point.scale = scale
        point.x = VIEW_W / 2 + scale * (-sim.playerX * ROAD_WIDTH - curveX) * VIEW_W / 2
        point.y = VIEW_H / 2 - scale * (segment.y - baseY - CAMERA_HEIGHT) * VIEW_H / 2
        point.road = scale * ROAD_WIDTH * VIEW_W / 2
        point.visible = point.y > VIEW_H * 0.2 && point.y < VIEW_H * 1.15 && point.road > 0
        curveX += curveDx
        curveDx += segment.curve
      }
      return base
    }

    const drawBackdrop = (sim: Simulation, base: number) => {
      const horizon = VIEW_H * 0.39
      const sky = ctx.createLinearGradient(0, 0, 0, horizon + 120)
      sky.addColorStop(0, "#071426")
      sky.addColorStop(0.58, "#3b245c")
      sky.addColorStop(1, "#ff8243")
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, VIEW_W, VIEW_H)

      const sunX = VIEW_W * 0.76 - track[base].curve * 10
      const glow = ctx.createRadialGradient(sunX, horizon - 58, 4, sunX, horizon - 58, 115)
      glow.addColorStop(0, "rgba(255,246,180,.95)")
      glow.addColorStop(0.36, "rgba(255,190,70,.85)")
      glow.addColorStop(1, "rgba(255,110,45,0)")
      ctx.fillStyle = glow
      ctx.fillRect(sunX - 130, horizon - 190, 260, 260)
      ctx.fillStyle = "#ffcf5c"
      ctx.beginPath()
      ctx.arc(sunX, horizon - 58, 46, 0, Math.PI * 2)
      ctx.fill()

      const parallax = (sim.position * 0.004 + sim.playerX * 120) % VIEW_W
      ctx.fillStyle = "#151b36"
      ctx.beginPath()
      ctx.moveTo(0, horizon + 35)
      for (let x = -80; x <= VIEW_W + 100; x += 80) {
        const worldX = x - parallax * 0.2
        const height = 45 + Math.sin((worldX + 120) * 0.014) * 35 + Math.sin(worldX * 0.031) * 18
        ctx.lineTo(x, horizon - height)
      }
      ctx.lineTo(VIEW_W, horizon + 80)
      ctx.lineTo(0, horizon + 80)
      ctx.fill()

      ctx.fillStyle = "#182d31"
      ctx.beginPath()
      ctx.moveTo(0, horizon + 52)
      for (let x = -40; x <= VIEW_W + 60; x += 55) {
        const height = 25 + Math.abs(Math.sin((x + parallax * 0.45) * 0.025)) * 40
        ctx.lineTo(x, horizon - height)
      }
      ctx.lineTo(VIEW_W, horizon + 90)
      ctx.lineTo(0, horizon + 90)
      ctx.fill()

      ctx.globalAlpha = 0.22
      ctx.fillStyle = "#ffd2a6"
      for (let i = 0; i < 4; i++) {
        const cloudX = ((i * 370 - parallax * (0.06 + i * 0.01)) % (VIEW_W + 360)) - 180
        const cloudY = 92 + i * 34
        ctx.beginPath()
        ctx.ellipse(cloudX, cloudY, 105 + i * 13, 13 + i * 2, -0.08, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      ctx.fillStyle = "rgba(255, 216, 126, .48)"
      for (let i = 0; i < 18; i++) {
        const lightX = (i * 83 + parallax * 0.12) % VIEW_W
        const lightY = horizon + 8 + (i % 3) * 7
        ctx.fillRect(lightX, lightY, 2, 2)
      }
    }

    const drawRoad = (base: number) => {
      for (let n = DRAW_DISTANCE - 1; n >= 1; n--) {
        const near = screen[n]
        const far = screen[n + 1]
        if (!near.visible || !far.visible || far.y >= near.y) continue
        const stripe = Math.floor((base + n) / 3) % 2 === 0
        ctx.fillStyle = stripe ? "#21402d" : "#1b3827"
        ctx.fillRect(0, far.y, VIEW_W, near.y - far.y + 1)

        quad(ctx, near.x, near.y, near.road * 1.12, far.x, far.y, far.road * 1.12, stripe ? "#f4efe2" : "#db3a34")
        quad(ctx, near.x, near.y, near.road, far.x, far.y, far.road, stripe ? "#3e414b" : "#353842")

        if (stripe) {
          for (let lane = 1; lane < LANES; lane++) {
            const fraction = -1 + (lane * 2) / LANES
            quad(
              ctx,
              near.x + near.road * fraction,
              near.y,
              Math.max(1, near.road * 0.012),
              far.x + far.road * fraction,
              far.y,
              Math.max(0.5, far.road * 0.012),
              "#f7d154",
            )
          }
        }

        if ((base + n) % 42 === 0 && near.road > 24) {
          const side = (base + n) % 84 === 0 ? -1 : 1
          drawRoadsideSign(near.x + side * near.road * 1.38, near.y, near.road * 0.12, side)
        }
        if ((base + n) % 19 === 0 && near.road > 18) {
          const side = (base + n) % 38 === 0 ? -1 : 1
          drawRoadsideTree(near.x + side * near.road * 1.55, near.y, near.road * 0.18)
        }
        if ((base + n) % 11 === 0 && near.road > 250) {
          const roadGlint = ((base + n) % 3 - 1) * near.road * 0.28
          quad(
            ctx,
            near.x + roadGlint,
            near.y,
            near.road * 0.006,
            far.x + roadGlint * 0.88,
            far.y,
            far.road * 0.003,
            "rgba(255,255,255,.11)",
          )
        }
      }
    }

    const drawRoadsideSign = (x: number, y: number, size: number, side: number) => {
      const h = clamp(size * 1.35, 7, 110)
      const w = h * 0.72
      ctx.fillStyle = "#30251e"
      ctx.fillRect(x - 2, y - h * 0.66, 4, h * 0.66)
      ctx.fillStyle = side < 0 ? "#f94144" : "#f9c74f"
      ctx.fillRect(x - w / 2, y - h, w, h * 0.45)
      if (h > 38) {
        ctx.fillStyle = "#10151f"
        ctx.font = `900 ${Math.max(8, h * 0.16)}px Arial`
        ctx.textAlign = "center"
        ctx.fillText(side < 0 ? "RASH" : "GO!", x, y - h * 0.71)
      }
    }

    const drawRoadsideTree = (x: number, y: number, size: number) => {
      const h = clamp(size * 1.8, 10, 165)
      ctx.fillStyle = "#17231d"
      ctx.fillRect(x - h * 0.035, y - h * 0.55, h * 0.07, h * 0.55)
      ctx.fillStyle = "#102a22"
      for (let layer = 0; layer < 3; layer++) {
        const top = y - h + layer * h * 0.2
        const half = h * (0.24 + layer * 0.08)
        ctx.beginPath()
        ctx.moveTo(x, top)
        ctx.lineTo(x + half, top + h * 0.48)
        ctx.lineTo(x - half, top + h * 0.48)
        ctx.closePath()
        ctx.fill()
      }
      ctx.fillStyle = "rgba(88, 174, 114, .18)"
      ctx.beginPath()
      ctx.moveTo(x, y - h)
      ctx.lineTo(x + h * 0.08, y - h * 0.52)
      ctx.lineTo(x - h * 0.04, y - h * 0.52)
      ctx.closePath()
      ctx.fill()
    }

    const drawTraffic = (point: { x: number; y: number; road: number }, car: Traffic) => {
      const width = clamp(point.road * (car.type === "van" ? 0.34 : 0.29), 5, car.type === "van" ? 190 : 165)
      const height = width * (car.type === "van" ? 0.72 : 0.58)
      const x = point.x - width / 2
      const y = point.y - height
      ctx.fillStyle = "rgba(0,0,0,.35)"
      ctx.beginPath()
      ctx.ellipse(point.x, point.y, width * 0.55, height * 0.09, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#090b0f"
      roundedRect(ctx, x - width * 0.015, y + height * 0.55, width * 0.18, height * 0.38, width * 0.035)
      roundedRect(ctx, x + width * 0.835, y + height * 0.55, width * 0.18, height * 0.38, width * 0.035)
      ctx.fillStyle = car.color
      roundedRect(ctx, x, y + height * 0.28, width, height * 0.68, width * 0.08)
      const bodyShine = ctx.createLinearGradient(x, 0, x + width, 0)
      bodyShine.addColorStop(0, "rgba(255,255,255,.08)")
      bodyShine.addColorStop(0.5, "rgba(255,255,255,.36)")
      bodyShine.addColorStop(1, "rgba(0,0,0,.18)")
      ctx.fillStyle = bodyShine
      roundedRect(ctx, x + width * 0.04, y + height * 0.32, width * 0.92, height * 0.18, width * 0.05)
      ctx.fillStyle = "#101827"
      roundedRect(ctx, x + width * 0.16, y, width * 0.68, height * 0.52, width * 0.08)
      const glass = ctx.createLinearGradient(0, y, 0, y + height * 0.4)
      glass.addColorStop(0, "#bde7f5")
      glass.addColorStop(0.35, "#52758c")
      glass.addColorStop(1, "#172432")
      ctx.fillStyle = glass
      roundedRect(ctx, x + width * 0.22, y + height * 0.08, width * 0.56, height * 0.25, width * 0.035)
      ctx.fillStyle = "rgba(255,255,255,.25)"
      ctx.fillRect(x + width * 0.27, y + height * 0.11, width * 0.17, Math.max(1, height * 0.025))
      ctx.fillStyle = "#ff304f"
      ctx.fillRect(x + width * 0.08, y + height * 0.72, width * 0.18, height * 0.12)
      ctx.fillRect(x + width * 0.74, y + height * 0.72, width * 0.18, height * 0.12)
      ctx.fillStyle = "#c7d1d8"
      ctx.fillRect(x + width * 0.08, y + height * 0.91, width * 0.84, Math.max(2, height * 0.045))
      ctx.fillStyle = "#f4f1de"
      roundedRect(ctx, x + width * 0.39, y + height * 0.78, width * 0.22, height * 0.1, width * 0.018)
    }

    const drawRival = (point: { x: number; y: number; road: number }, rival: Rider) => {
      const width = clamp(point.road * 0.25, 8, 132)
      const height = width * 1.26
      const x = point.x
      const y = point.y
      ctx.save()
      if (rival.crashed > 0) {
        ctx.translate(x, y)
        ctx.rotate(1.12)
        ctx.translate(-x, -y)
      }
      ctx.fillStyle = "rgba(0,0,0,.4)"
      ctx.beginPath()
      ctx.ellipse(x, y, width * 0.55, height * 0.075, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#101116"
      ctx.beginPath()
      ctx.ellipse(x, y - height * 0.04, width * 0.25, height * 0.16, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = "#bac2cc"
      ctx.lineWidth = Math.max(1, width * 0.035)
      ctx.beginPath()
      ctx.moveTo(x - width * 0.25, y - height * 0.2)
      ctx.lineTo(x + width * 0.25, y - height * 0.2)
      ctx.stroke()
      ctx.fillStyle = rival.hitTimer > 0 ? "#ffffff" : rival.color
      roundedRect(ctx, x - width * 0.27, y - height * 0.49, width * 0.54, height * 0.42, width * 0.1)
      ctx.fillStyle = "#d9e2ec"
      roundedRect(ctx, x - width * 0.16, y - height * 0.24, width * 0.32, height * 0.07, width * 0.02)
      ctx.fillStyle = "#171b26"
      roundedRect(ctx, x - width * 0.31, y - height * 0.83, width * 0.62, height * 0.4, width * 0.12)
      ctx.fillStyle = rival.color
      ctx.fillRect(x - width * 0.045, y - height * 0.76, width * 0.09, height * 0.26)
      ctx.fillStyle = rival.hitTimer > 0 ? "#fff" : rival.color
      ctx.beginPath()
      ctx.arc(x, y - height * 0.9, width * 0.21, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#090d15"
      ctx.fillRect(x - width * 0.16, y - height * 0.93, width * 0.32, height * 0.09)
      if (width > 32) {
        ctx.font = `900 ${clamp(width * 0.13, 7, 14)}px Arial`
        ctx.textAlign = "center"
        ctx.fillStyle = "#fff"
        ctx.fillText(rival.name, x, y - height * 1.19)
        ctx.fillStyle = "rgba(0,0,0,.65)"
        ctx.fillRect(x - width * 0.35, y - height * 1.12, width * 0.7, Math.max(3, width * 0.05))
        ctx.fillStyle = rival.health > 40 ? "#7ae582" : "#ff4d6d"
        ctx.fillRect(x - width * 0.35, y - height * 1.12, width * 0.7 * (rival.health / 100), Math.max(3, width * 0.05))
      }
      ctx.restore()
    }

    const drawPlayer = (sim: Simulation) => {
      const cx = VIEW_W / 2 + sim.lean * 31
      const bottom = VIEW_H + 7
      const lean = sim.lean * 0.07
      ctx.save()
      ctx.translate(cx, bottom - 120)
      ctx.rotate(lean)
      ctx.translate(-cx, -(bottom - 120))
      ctx.fillStyle = "rgba(0,0,0,.5)"
      ctx.beginPath()
      ctx.ellipse(cx, bottom - 10, 92, 17, 0, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = "#0a0d12"
      ctx.beginPath()
      ctx.ellipse(cx, bottom - 34, 49, 30, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#353c48"
      ctx.beginPath()
      ctx.ellipse(cx, bottom - 34, 24, 13, 0, 0, Math.PI * 2)
      ctx.fill()

      const speedRatio = sim.speed / MAX_SPEED
      if (speedRatio > 0.52) {
        const boosting = Boolean((keysRef.current.shift || keysRef.current.k) && sim.nitro > 0)
        const flameLength = 22 + speedRatio * 24 + (boosting ? 30 : 0)
        ctx.fillStyle = boosting ? "#48cae4" : "#ff9f1c"
        ctx.beginPath()
        ctx.moveTo(cx - 20, bottom - 53)
        ctx.lineTo(cx, bottom - 53 + flameLength)
        ctx.lineTo(cx + 20, bottom - 53)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = "#fff3b0"
        ctx.beginPath()
        ctx.moveTo(cx - 8, bottom - 50)
        ctx.lineTo(cx, bottom - 35 + flameLength * 0.45)
        ctx.lineTo(cx + 8, bottom - 50)
        ctx.closePath()
        ctx.fill()
      }

      ctx.fillStyle = "#e63946"
      roundedRect(ctx, cx - 55, bottom - 122, 110, 82, 21)
      ctx.fillStyle = "#edf2f4"
      roundedRect(ctx, cx - 39, bottom - 105, 78, 18, 8)
      ctx.fillStyle = "#ff334c"
      ctx.shadowColor = "#ff334c"
      ctx.shadowBlur = 16
      roundedRect(ctx, cx - 29, bottom - 118, 58, 14, 6)
      ctx.shadowBlur = 0
      ctx.fillStyle = "#171d28"
      roundedRect(ctx, cx - 48, bottom - 217, 96, 115, 27)
      ctx.fillStyle = "#e63946"
      roundedRect(ctx, cx - 35, bottom - 202, 70, 42, 16)
      ctx.fillStyle = "#f6bd60"
      ctx.fillRect(cx - 4, bottom - 197, 8, 34)

      const punching = sim.attack > 0
      const attackX = sim.attackSide * (punching ? 112 : 55)
      ctx.strokeStyle = "#171d28"
      ctx.lineWidth = 24
      ctx.lineCap = "round"
      ctx.beginPath()
      ctx.moveTo(cx - 33, bottom - 181)
      ctx.lineTo(cx - (punching && sim.attackSide < 0 ? 112 : 60), bottom - (punching ? 191 : 130))
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx + 33, bottom - 181)
      ctx.lineTo(cx + (punching && sim.attackSide > 0 ? 112 : 60), bottom - (punching ? 191 : 130))
      ctx.stroke()
      if (punching) {
        ctx.fillStyle = "#ffd166"
        ctx.beginPath()
        ctx.arc(cx + attackX, bottom - 191, 15, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.fillStyle = "#e63946"
      ctx.beginPath()
      ctx.arc(cx, bottom - 237, 34, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#070d17"
      roundedRect(ctx, cx - 27, bottom - 244, 54, 18, 8)
      ctx.fillStyle = "rgba(255,255,255,.35)"
      roundedRect(ctx, cx - 20, bottom - 263, 28, 7, 3)
      ctx.restore()
    }

    const drawSpeedLines = (sim: Simulation) => {
      const intensity = clamp(sim.speed / MAX_SPEED - 0.55, 0, 0.6)
      if (intensity <= 0) return
      ctx.save()
      ctx.globalAlpha = intensity * 0.75
      ctx.strokeStyle = "#dce7ef"
      ctx.lineWidth = 2
      for (let i = 0; i < 11; i++) {
        const seed = (i * 97 + Math.floor(sim.position * 0.025)) % 1000
        const x = VIEW_W * 0.5 + ((seed / 1000) * 2 - 1) * VIEW_W * 0.48
        const y = VIEW_H * (0.58 + ((i * 41) % 37) / 100)
        const pull = (x - VIEW_W / 2) * 0.12
        ctx.beginPath()
        ctx.moveTo(x - pull, y - 24)
        ctx.lineTo(x, y + 22 + intensity * 90)
        ctx.stroke()
      }
      ctx.restore()
    }

    const render = () => {
      const sim = simRef.current
      const shakeX = sim.shake > 0 ? (Math.random() - 0.5) * 18 * Math.min(1, sim.shake * 4) : 0
      const shakeY = sim.shake > 0 ? (Math.random() - 0.5) * 10 * Math.min(1, sim.shake * 4) : 0
      ctx.save()
      ctx.translate(shakeX, shakeY)

      const base = projectRoad(sim)
      drawBackdrop(sim, base)
      drawRoad(base)
      drawSpeedLines(sim)

      const drawables: Array<{ z: number; kind: "rival" | "traffic"; point: { x: number; y: number; road: number }; entity: Rider | Traffic }> = []
      for (const car of sim.traffic) {
        const point = relativeScreen(car.z, car.lane)
        if (point) drawables.push({ z: car.z, kind: "traffic", point, entity: car })
      }
      for (const rival of sim.rivals) {
        const point = relativeScreen(rival.z, rival.lane)
        if (point) drawables.push({ z: rival.z, kind: "rival", point, entity: rival })
      }
      drawables.sort((a, b) => b.z - a.z)
      for (const item of drawables) {
        if (item.kind === "traffic") drawTraffic(item.point, item.entity as Traffic)
        else drawRival(item.point, item.entity as Rider)
      }

      drawPlayer(sim)
      for (const particle of sim.particles) {
        ctx.globalAlpha = clamp(particle.life * 2.5, 0, 1)
        ctx.fillStyle = particle.color
        ctx.fillRect(particle.x, particle.y, 5, 5)
      }
      ctx.globalAlpha = 1

      if (sim.hit > 0) {
        const flash = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 80, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.7)
        flash.addColorStop(0, "rgba(255,20,40,0)")
        flash.addColorStop(1, `rgba(255,20,40,${sim.hit * 0.55})`)
        ctx.fillStyle = flash
        ctx.fillRect(0, 0, VIEW_W, VIEW_H)
      }
      ctx.restore()
    }

    const loop = (now: number) => {
      const dt = Math.min(0.045, (now - previous) / 1000)
      previous = now
      update(dt)
      render()
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [changePhase])

  return (
    <div className="rr-game" aria-label="Roadrash arcade motorcycle racing game">
      <div className="rr-screen">
        <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} />
        {(phase === "racing" || phase === "countdown") && (
          <GameHud hud={hud} phase={phase} keys={keysRef} queueAttack={() => (attackQueuedRef.current = true)} />
        )}
        {phase === "menu" && <MenuOverlay onStart={startRace} />}
        {phase === "finished" && <ResultOverlay won rank={hud.rank} onStart={startRace} />}
        {phase === "wrecked" && <ResultOverlay won={false} rank={hud.rank} onStart={startRace} />}
      </div>
      <div className="rr-control-strip">
        <span><kbd>WASD</kbd> / <kbd>ARROWS</kbd> RIDE</span>
        <span><kbd>SPACE</kbd> PUNCH</span>
        <span><kbd>SHIFT</kbd> NITRO</span>
      </div>
    </div>
  )
}

function GameHud({
  hud,
  phase,
  keys,
  queueAttack,
}: {
  hud: Hud
  phase: Phase
  keys: React.MutableRefObject<Keys>
  queueAttack: () => void
}) {
  const hold = (key: string, active: boolean) => () => {
    keys.current[key] = active
  }
  return (
    <div className="rr-hud">
      <div className="rr-rank">
        <small>POSITION</small>
        <strong>{ordinal(hud.rank)}</strong>
      </div>
      <div className="rr-racebar">
        <span style={{ width: `${hud.progress}%` }} />
        <i style={{ left: `${hud.progress}%` }}>▲</i>
        <b>COAST RUN • {hud.progress}%</b>
      </div>
      <div className="rr-speed">
        <strong>{hud.speed}</strong>
        <small>MPH</small>
      </div>
      <div className="rr-health">
        <label><span>RIDER ARMOR</span><b>{hud.health}/{MAX_HEALTH}</b></label>
        <div><i style={{ width: `${(hud.health / MAX_HEALTH) * 100}%` }} /></div>
        <label><span>NITRO</span><b>{hud.nitro}</b></label>
        <div className="nitro"><i style={{ width: `${hud.nitro}%` }} /></div>
      </div>
      {hud.rival && (
        <div className="rr-rival-health">
          <label>{hud.rival}</label>
          <div><i style={{ width: `${hud.rivalHealth}%` }} /></div>
        </div>
      )}
      {hud.message && <div className="rr-callout">{hud.message}</div>}
      {phase === "countdown" && <div className="rr-countdown">{hud.countdown || "GO!"}</div>}
      <div className="rr-touch" aria-label="Touch controls">
        <div>
          <TouchControl label="◀" onDown={hold("arrowleft", true)} onUp={hold("arrowleft", false)} />
          <TouchControl label="▶" onDown={hold("arrowright", true)} onUp={hold("arrowright", false)} />
        </div>
        <div>
          <TouchControl label="HIT" onDown={queueAttack} />
          <TouchControl label="N₂O" onDown={hold("shift", true)} onUp={hold("shift", false)} />
          <TouchControl label="GAS" accent onDown={hold("arrowup", true)} onUp={hold("arrowup", false)} />
        </div>
      </div>
    </div>
  )
}

function TouchControl({
  label,
  accent,
  onDown,
  onUp,
}: {
  label: string
  accent?: boolean
  onDown: () => void
  onUp?: () => void
}) {
  return (
    <button
      type="button"
      className={accent ? "accent" : ""}
      onPointerDown={(event) => {
        event.preventDefault()
        onDown()
      }}
      onPointerUp={(event) => {
        event.preventDefault()
        onUp?.()
      }}
      onPointerCancel={() => onUp?.()}
      onPointerLeave={() => onUp?.()}
      aria-label={label}
    >
      {label}
    </button>
  )
}

function MenuOverlay({ onStart }: { onStart: () => void }) {
  return (
    <div className="rr-overlay rr-menu">
      <p className="rr-kicker">ARCADE MOTORCYCLE COMBAT</p>
      <h2>ROAD<span>RASH</span></h2>
      <p className="rr-menu-copy">Five riders. One finish line. No clean racing.</p>
      <button type="button" onClick={onStart}>START RACE <span>↵</span></button>
      <div className="rr-menu-tips">
        <span>GET BESIDE A RIVAL</span>
        <b>THEN HIT SPACE TO SWING</b>
      </div>
    </div>
  )
}

function ResultOverlay({ won, rank, onStart }: { won: boolean; rank: number; onStart: () => void }) {
  return (
    <div className="rr-overlay rr-results">
      <p className="rr-kicker">{won ? "COAST RUN COMPLETE" : "YOUR RIDE IS OVER"}</p>
      <h2>{won ? ordinal(rank) : "WRECKED"}</h2>
      <p>{won ? (rank === 1 ? "You own this road." : "You finished. Now come back for first.") : "The pack leaves you in the dust."}</p>
      <button type="button" onClick={onStart}>RACE AGAIN <span>↻</span></button>
    </div>
  )
}
