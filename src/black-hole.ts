export interface BlackHole {
  x: number
  y: number
  vx: number
  vy: number
  mass: number
  eventHorizon: number       // visual black core radius
  exclusionRadius: number    // text exclusion zone (smaller, tighter)
  influenceRadius: number    // gravitational influence (larger, for inspiral detection)
  accretionAngle: number
  accretionSpeed: number
  age: number
  alive: boolean
  spawnScale: number
  shockwave: number
  shockwaveMass: number
  inspiral: number
  inspiralPartner: number
}

export interface MergeEvent {
  x: number
  y: number
  mass: number
}

// Slower, more deliberate gravity
const G = 400
const INSPIRAL_THRESHOLD = 3.5   // start inspiral at 3.5x sum of event horizons — much wider range
const MERGE_THRESHOLD = 0.5      // merge when very close

export function createBlackHole(x: number, y: number, vx = 0, vy = 0, mass = 1): BlackHole {
  const eh = 28 * Math.sqrt(mass)
  return {
    x, y, vx, vy,
    mass,
    eventHorizon: eh,
    exclusionRadius: eh * 2.8,           // text carves out ~2.8x the visual core
    influenceRadius: eh * 7,             // gravity field extends much further
    accretionAngle: Math.random() * Math.PI * 2,
    accretionSpeed: 0.25,
    age: 0,
    alive: true,
    spawnScale: 0,
    shockwave: 0,
    shockwaveMass: 0,
    inspiral: 0,
    inspiralPartner: -1,
  }
}

function recalcRadii(h: BlackHole) {
  h.eventHorizon = 28 * Math.sqrt(h.mass)
  h.exclusionRadius = h.eventHorizon * 2.8
  h.influenceRadius = h.eventHorizon * 7
}

export function updateBlackHoles(
  holes: BlackHole[], dt: number, width: number, height: number,
): MergeEvent[] {
  const mergeEvents: MergeEvent[] = []

  // Reset inspiral
  for (const h of holes) {
    if (!h.alive) continue
    h.inspiral = 0
    h.inspiralPartner = -1
  }

  // N-body gravity + inspiral
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
      const sumEH = a.eventHorizon + b.eventHorizon

      // Merge
      if (dist < sumEH * MERGE_THRESHOLD) {
        mergeEvents.push(mergeBlackHoles(a, b))
        continue
      }

      // Inspiral phase — wider range, slower pull
      if (dist < sumEH * INSPIRAL_THRESHOLD) {
        const range = sumEH * (INSPIRAL_THRESHOLD - MERGE_THRESHOLD)
        const depth = Math.max(0, Math.min(1, 1 - (dist - sumEH * MERGE_THRESHOLD) / range))

        if (depth > a.inspiral) { a.inspiral = depth; a.inspiralPartner = j }
        if (depth > b.inspiral) { b.inspiral = depth; b.inspiralPartner = i }

        // Inward drag — gradual, not aggressive
        const inspiralForce = depth * depth * G * 1.5 * (a.mass + b.mass)
        const ifx = inspiralForce * dx / dist * dt
        const ify = inspiralForce * dy / dist * dt
        a.vx += ifx / a.mass
        a.vy += ify / a.mass
        b.vx -= ifx / b.mass
        b.vy -= ify / b.mass

        // Tangential kick for visible spiral orbit
        const tangent = depth * depth * 0.3 * dt
        a.vx += (-dy / dist) * tangent * G * b.mass / (dist + 40)
        a.vy += (dx / dist) * tangent * G * b.mass / (dist + 40)
        b.vx += (dy / dist) * tangent * G * a.mass / (dist + 40)
        b.vy += (-dx / dist) * tangent * G * a.mass / (dist + 40)

        // Accretion speedup
        a.accretionSpeed = 0.25 + depth * depth * 3
        b.accretionSpeed = 0.25 + depth * depth * 3

        // Dampen velocity as they get very close — makes the spiral tighter/slower
        if (depth > 0.7) {
          const dampen = 1 - (depth - 0.7) * 0.3 * dt
          a.vx *= dampen; a.vy *= dampen
          b.vx *= dampen; b.vy *= dampen
        }
      }

      // Normal gravity — slower G
      const softening = 30
      const force = G * a.mass * b.mass / (distSq + softening * softening)
      const fx = force * dx / dist
      const fy = force * dy / dist

      a.vx += fx / a.mass * dt
      a.vy += fy / a.mass * dt
      b.vx -= fx / b.mass * dt
      b.vy -= fy / b.mass * dt
    }
  }

  // Update positions
  for (const h of holes) {
    if (!h.alive) continue

    h.x += h.vx * dt
    h.y += h.vy * dt
    h.age += dt
    h.accretionAngle += h.accretionSpeed * dt / Math.sqrt(h.mass)

    if (h.inspiral === 0) {
      h.accretionSpeed += (0.25 - h.accretionSpeed) * dt * 2
    }

    if (h.spawnScale < 1) h.spawnScale = Math.min(1, h.spawnScale + dt * 3.5)

    if (h.shockwave > 0) {
      h.shockwave += dt * 2
      if (h.shockwave > 1) h.shockwave = 0
    }

    // Boundary
    const m = h.eventHorizon
    if (h.x < m) { h.x = m; h.vx = Math.abs(h.vx) * 0.2 }
    if (h.x > width - m) { h.x = width - m; h.vx = -Math.abs(h.vx) * 0.2 }
    if (h.y < m) { h.y = m; h.vy = Math.abs(h.vy) * 0.2 }
    if (h.y > height - m) { h.y = height - m; h.vy = -Math.abs(h.vy) * 0.2 }

    // Light friction
    h.vx *= 0.997
    h.vy *= 0.997
  }

  return mergeEvents
}

function mergeBlackHoles(a: BlackHole, b: BlackHole): MergeEvent {
  const [big, small] = a.mass >= b.mass ? [a, b] : [b, a]
  const total = big.mass + small.mass
  const mx = (big.x * big.mass + small.x * small.mass) / total
  const my = (big.y * big.mass + small.y * small.mass) / total

  big.vx = (big.vx * big.mass + small.vx * small.mass) / total
  big.vy = (big.vy * big.mass + small.vy * small.mass) / total
  big.x = mx; big.y = my
  big.mass = total
  recalcRadii(big)
  big.shockwave = 0.01
  big.shockwaveMass = total
  big.accretionSpeed = 0.25

  small.alive = false
  return { x: mx, y: my, mass: total }
}

export function getHoleAtPoint(holes: BlackHole[], x: number, y: number): BlackHole | null {
  for (let i = holes.length - 1; i >= 0; i--) {
    const h = holes[i]!
    if (!h.alive) continue
    const dx = h.x - x, dy = h.y - y
    if (dx * dx + dy * dy < (h.eventHorizon * 1.8) ** 2) return h
  }
  return null
}

export function getHoleNearPoint(holes: BlackHole[], x: number, y: number): BlackHole | null {
  for (let i = holes.length - 1; i >= 0; i--) {
    const h = holes[i]!
    if (!h.alive) continue
    const dx = h.x - x, dy = h.y - y
    if (dx * dx + dy * dy < h.exclusionRadius ** 2) return h
  }
  return null
}
