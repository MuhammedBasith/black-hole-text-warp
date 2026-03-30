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
  }
}

export function updateBlackHoles(holes: BlackHole[], dt: number, width: number, height: number) {
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
        mergeBlackHoles(a, b)
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

  // Update positions, accretion rotation
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i]!
    if (!h.alive) continue

    h.x += h.vx * dt
    h.y += h.vy * dt
    h.age += dt
    h.accretionAngle += (0.3 / Math.sqrt(h.mass)) * dt

    // Soft boundary — bounce with damping
    const margin = h.eventHorizon
    if (h.x < margin) { h.x = margin; h.vx = Math.abs(h.vx) * 0.5 }
    if (h.x > width - margin) { h.x = width - margin; h.vx = -Math.abs(h.vx) * 0.5 }
    if (h.y < margin) { h.y = margin; h.vy = Math.abs(h.vy) * 0.5 }
    if (h.y > height - margin) { h.y = height - margin; h.vy = -Math.abs(h.vy) * 0.5 }

    // Gentle friction
    h.vx *= 0.999
    h.vy *= 0.999
  }
}

function mergeBlackHoles(a: BlackHole, b: BlackHole) {
  // Bigger absorbs smaller
  const [big, small] = a.mass >= b.mass ? [a, b] : [b, a]
  const totalMass = big.mass + small.mass

  // Momentum conservation
  big.vx = (big.vx * big.mass + small.vx * small.mass) / totalMass
  big.vy = (big.vy * big.mass + small.vy * small.mass) / totalMass

  // Center of mass
  big.x = (big.x * big.mass + small.x * small.mass) / totalMass
  big.y = (big.y * big.mass + small.y * small.mass) / totalMass

  big.mass = totalMass
  big.eventHorizon = 30 * Math.sqrt(totalMass)
  big.influenceRadius = 180 * Math.sqrt(totalMass)

  small.alive = false
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
