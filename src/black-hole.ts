import type { Vec2 } from './utils.ts'

export interface BlackHole {
  x: number
  y: number
  vx: number
  vy: number
  mass: number
  eventHorizon: number
  influenceRadius: number
  accretionAngle: number
  age: number
  alive: boolean
  // Spawn animation
  spawnScale: number
  // Merge shockwave
  shockwave: number  // 0 = none, counts up during shockwave
  shockwaveMass: number  // mass at time of merge (for sizing)
}

export interface MergeEvent {
  x: number
  y: number
  mass: number
}

const G = 800
const MERGE_FACTOR = 0.8

export function createBlackHole(x: number, y: number, vx = 0, vy = 0, mass = 1): BlackHole {
  return {
    x, y, vx, vy,
    mass,
    eventHorizon: 30 * Math.sqrt(mass),
    influenceRadius: 180 * Math.sqrt(mass),
    accretionAngle: Math.random() * Math.PI * 2,
    age: 0,
    alive: true,
    spawnScale: 0,
    shockwave: 0,
    shockwaveMass: 0,
  }
}

export function updateBlackHoles(
  holes: BlackHole[], dt: number, width: number, height: number,
): MergeEvent[] {
  const mergeEvents: MergeEvent[] = []

  // N-body gravity
  for (let i = 0; i < holes.length; i++) {
    const a = holes[i]!
    if (!a.alive) continue
    for (let j = i + 1; j < holes.length; j++) {
      const b = holes[j]!
      if (!b.alive) continue

      const dx = b.x - a.x
      const dy = b.y - a.y
      const distSq = dx * dx + dy * dy
      const dist = Math.sqrt(distSq)

      // Merge check
      if (dist < (a.eventHorizon + b.eventHorizon) * MERGE_FACTOR) {
        const event = mergeBlackHoles(a, b)
        mergeEvents.push(event)
        continue
      }

      // Gravitational force
      const softening = 50
      const force = G * a.mass * b.mass / (distSq + softening * softening)
      const fx = force * dx / dist
      const fy = force * dy / dist

      a.vx += fx / a.mass * dt
      a.vy += fy / a.mass * dt
      b.vx -= fx / b.mass * dt
      b.vy -= fy / b.mass * dt
    }
  }

  // Update positions, accretion rotation, animations
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i]!
    if (!h.alive) continue

    h.x += h.vx * dt
    h.y += h.vy * dt
    h.age += dt
    h.accretionAngle += (0.4 / Math.sqrt(h.mass)) * dt

    // Spawn scale animation (elastic ease out)
    if (h.spawnScale < 1) {
      h.spawnScale = Math.min(1, h.spawnScale + dt * 3)
    }

    // Shockwave decay
    if (h.shockwave > 0) {
      h.shockwave += dt * 2
      if (h.shockwave > 1) h.shockwave = 0
    }

    // Soft boundary — bounce with damping
    const margin = h.eventHorizon
    if (h.x < margin) { h.x = margin; h.vx = Math.abs(h.vx) * 0.4 }
    if (h.x > width - margin) { h.x = width - margin; h.vx = -Math.abs(h.vx) * 0.4 }
    if (h.y < margin) { h.y = margin; h.vy = Math.abs(h.vy) * 0.4 }
    if (h.y > height - margin) { h.y = height - margin; h.vy = -Math.abs(h.vy) * 0.4 }

    // Gentle friction
    h.vx *= 0.998
    h.vy *= 0.998
  }

  return mergeEvents
}

function mergeBlackHoles(a: BlackHole, b: BlackHole): MergeEvent {
  const [big, small] = a.mass >= b.mass ? [a, b] : [b, a]
  const totalMass = big.mass + small.mass

  const mergeX = (big.x * big.mass + small.x * small.mass) / totalMass
  const mergeY = (big.y * big.mass + small.y * small.mass) / totalMass

  // Momentum conservation
  big.vx = (big.vx * big.mass + small.vx * small.mass) / totalMass
  big.vy = (big.vy * big.mass + small.vy * small.mass) / totalMass

  big.x = mergeX
  big.y = mergeY
  big.mass = totalMass
  big.eventHorizon = 30 * Math.sqrt(totalMass)
  big.influenceRadius = 180 * Math.sqrt(totalMass)

  // Trigger shockwave on the surviving hole
  big.shockwave = 0.01
  big.shockwaveMass = totalMass

  small.alive = false

  return { x: mergeX, y: mergeY, mass: totalMass }
}

export function getHoleAtPoint(holes: BlackHole[], x: number, y: number): BlackHole | null {
  for (let i = holes.length - 1; i >= 0; i--) {
    const h = holes[i]!
    if (!h.alive) continue
    const dx = h.x - x
    const dy = h.y - y
    // Generous hit area — 1.5x the event horizon
    if (dx * dx + dy * dy < (h.eventHorizon * 1.5) ** 2) return h
  }
  return null
}

export function getHoleNearPoint(holes: BlackHole[], x: number, y: number): BlackHole | null {
  for (let i = holes.length - 1; i >= 0; i--) {
    const h = holes[i]!
    if (!h.alive) continue
    const dx = h.x - x
    const dy = h.y - y
    if (dx * dx + dy * dy < (h.influenceRadius * 0.8) ** 2) return h
  }
  return null
}

export function getGravitationalPull(hole: BlackHole, point: Vec2): Vec2 {
  const dx = hole.x - point.x
  const dy = hole.y - point.y
  const distSq = dx * dx + dy * dy
  const dist = Math.sqrt(distSq)
  if (dist < 1) return { x: 0, y: 0 }
  const force = G * hole.mass / (distSq + 100)
  return { x: force * dx / dist, y: force * dy / dist }
}
