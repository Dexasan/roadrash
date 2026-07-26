# Roadrash

> The first game I played became the first reason I wanted to understand computers.

Roadrash is a playable browser tribute to **Road Rash**, the game that first made computers feel magical to me. I did not know what rendering loops, input systems, physics, or state machines were—I only knew that pressing a key could make something on a screen feel alive.

This project turns that memory into a small engineering exercise: a motorcycle combat racer built directly with React, TypeScript, and the Canvas 2D API.

## Play

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

| Control | Action |
|---|---|
| `↑` / `W` | Accelerate |
| `↓` / `S` | Brake |
| `← →` / `A D` | Steer |
| `Space` / `J` / `F` | Punch |

Touch controls appear automatically on smaller screens.

## Under the hood

- Pseudo-3D road projection using hand-built canvas segments
- Curves, elevation, rumble strips, lane markers, and finite track progress
- RequestAnimationFrame game loop with delta-time updates
- Rival riders with movement, attacks, health, and knockdown state
- Ambient road traffic and collision handling
- Player acceleration, braking, off-road drag, steering, and centrifugal force
- Keyboard and pointer-based mobile input
- Throttled React HUD updates separated from the mutable simulation state

## Why this repository exists

This is not intended as a reproduction of the original commercial game or its assets. It is an original, non-commercial fan tribute built from code and simple geometric rendering. The goal is to preserve the feeling of the experience that first pulled me toward computers while demonstrating the engineering behind a small browser game.

## Stack

- Next.js 16
- React 19
- TypeScript
- Canvas 2D
- Tailwind CSS
- Vercel Analytics

## Validation

```bash
pnpm build
```

The production build runs in GitHub Actions on every push and pull request.

---

Built by [Sandesh Chapagain](https://github.com/Dexasan).
