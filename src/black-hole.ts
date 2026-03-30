export interface BlackHole {
  x: number
  y: number
  vx: number
  vy: number
  mass: number
  eventHorizon: number
  influenceRadius: number
  accretionAngle: number
  accretionSpeed: number  // speeds up during inspiral
  age: number
  alive: boolean
  spawnScale: number
  shockwave: number
  shockwaveMass: number
  // Inspiral state
  inspiral: number         // 0 = not inspiraling, 0..1 = how deep into inspiral phase
  inspiralPartner: number  // index of the hole we're spiraling toward
}

export interface MergeEvent {
  x: number
  y: number
  mass: number
}

const G = 800
const INSPIRAL_THRESHOLD = 2.5  // start inspiral at this * sum of event horizons
const MERGE_THRESHOLD = 0.6     // actually merge at this * sum of event horizons

export function createBlackHole(x: number, y: number, vx = 0, vy = 0, mass = 1): BlackHole {
  const eh = 30 * Math.sqrt(mass)
  return {
    x, y, vx, vy,
    mass,
    eventHorizon: eh,
    influenceRadius: 180 * Math.sqrt(mass),
    accretionAngle: Math.random() * Math.PI * 2,
    accretionSpeed: 0.3,
    age: 0,
    alive: true,
    spawnScale: 0,
    shockwave: 0,
    shockwaveMass: 0,
    inspiral: 0,
    inspiralPartner: -1,
  }
}

export function updateBlackHoles(
  holes: BlackHole[], dt: number, width: number, height: number,
): MergeEvent[] {
  const mergeEvents: MergeEvent[] = []

  // Reset inspiral state
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i]!
    if (!h.alive) continue
    h.inspiral = 0
    h.inspiralPartner = -1
  }

  // N-body gravity + inspiral detection
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

      // Merge: only when very close
      if (dist < sumEH * MERGE_THRESHOLD) {
        const event = mergeBlackHoles(a, b)
        mergeEvents.push(event)
        continue
      }

      // Inspiral phase: when within threshold, add extra drag pulling them together
      // and speed up their accretion rotation
      if (dist < sumEH * INSPIRAL_THRESHOLD) {
        const inspiralDepth = 1 - (dist - sumEH * MERGE_THRESHOLD) / (sumEH * (INSPIRAL_THRESHOLD - MERGE_THRESHOLD))
        const clamped = Math.max(0, Math.min(1, inspiralDepth))

        // Mark both holes as inspiraling
        if (clamped > a.inspiral) { a.inspiral = clamped; a.inspiralPartner = j }
        if (clamped > b.inspiral) { b.inspiral = clamped; b.inspiralPartner = i }

        // Extra inward force during inspiral (gravitational radiation drains orbital energy)
        const inspiralForce = clamped * clamped * G * 3 * (a.mass + b.mass)
        const ifx = inspiralForce * dx / dist * dt
        const ify = inspiralForce * dy / dist * dt
        a.vx += ifx / a.mass
        a.vy += ify / a.mass
        b.vx -= ifx / b.mass
        b.vy -= ify / b.mass

        // Speed up accretion disk rotation as they inspiral
        a.accretionSpeed = 0.3 + clamped * clamped * 4
        b.accretionSpeed = 0.3 + clamped * clamped * 4

        // Add tangential velocity for the spiral visual
        // (perpendicular kick so they orbit faster as they get closer)
        const tangentScale = clamped * 0.5 * dt
        a.vx += (-dy / dist) * tangentScale * G * b.mass / (dist + 50)
        a.vy += (dx / dist) * tangentScale * G * b.mass / (dist + 50)
        b.vx += (dy / dist) * tangentScale * G * a.mass / (dist + 50)
        b.vy += (-dx / dist) * tangentScale * G * a.mass / (dist + 50)
      }

      // Normal gravitational force
      const softening = 40
      const force = G * a.mass * b.mass / (distSq + softening * softening)
      const fx = force * dx / dist
      const fy = force * dy / dist

      a.vx += fx / a.mass * dt
      a.vy += fy / a.mass * dt
      b.vx -= fx / b.mass * dt
      b.vy -= fy / b.mass * dt
    }
  }

  // Update positions and animations
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i]!
    if (!h.alive) continue

    h.x += h.vx * dt
    h.y += h.vy * dt
    h.age += dt
    h.accretionAngle += h.accretionSpeed * dt / Math.sqrt(h.mass)

    // Reset accretion speed if not inspiraling
    if (h.inspiral === 0) {
      h.accretionSpeed += (0.3 - h.accretionSpeed) * dt * 3 // ease back to normal
    }

    // Spawn scale
    if (h.spawnScale < 1) {
      h.spawnScale = Math.min(1, h.spawnScale + dt * 4)
    }

    // Shockwave decay
    if (h.shockwave > 0) {
      h.shockwave += dt * 2.5
      if (h.shockwave > 1) h.shockwave = 0
    }

    // Boundary bounce
    const margin = h.eventHorizon
    if (h.x < margin) { h.x = margin; h.vx = Math.abs(h.vx) * 0.3 }
    if (h.x > width - margin) { h.x = width - margin; h.vx = -Math.abs(h.vx) * 0.3 }
    if (h.y < margin) { h.y = margin; h.vy = Math.abs(h.vy) * 0.3 }
    if (h.y > height - margin) { h.y = height - margin; h.vy = -Math.abs(h.vy) * 0.3 }

    // Friction
    h.vx *= 0.998
    h.vy *= 0.998
  }

  return mergeEvents
}

function mergeBlackHoles(a: BlackHole, b: BlackHole): MergeEvent {
  const [big, small] = a.mass >= b.mass ? [a, b] : [b, a]
  const totalMass = big.mass + small.mass

  const mx = (big.x * big.mass + small.x * small.mass) / totalMass
  const my = (big.y * big.mass + small.y * small.mass) / totalMass

  big.vx = (big.vx * big.mass + small.vx * small.mass) / totalMass
  big.vy = (big.vy * big.mass + small.vy * small.mass) / totalMass
  big.x = mx
  big.y = my
  big.mass = totalMass
  big.eventHorizon = 30 * Math.sqrt(totalMass)
  big.influenceRadius = 180 * Math.sqrt(totalMass)
  big.shockwave = 0.01
  big.shockwaveMass = totalMass
  big.accretionSpeed = 0.3  // reset after merge

  small.alive = false

  return { x: mx, y: my, mass: totalMass }
}

export function getHoleAtPoint(holes: BlackHole[], x: number, y: number): BlackHole | null {
  for (let i = holes.length - 1; i >= 0; i--) {
    const h = holes[i]!
    if (!h.alive) continue
    const dx = h.x - x, dy = h.y - y
    if (dx * dx + dy * dy < (h.eventHorizon * 1.5) ** 2) return h
  }
  return null
}

export function getHoleNearPoint(holes: BlackHole[], x: number, y: number): BlackHole | null {
  for (let i = holes.length - 1; i >= 0; i--) {
    const h = holes[i]!
    if (!h.alive) continue
    const dx = h.x - x, dy = h.y - y
    if (dx * dx + dy * dy < (h.influenceRadius * 0.8) ** 2) return h
  }
  return null
}
