import type { BlackHole, MergeEvent } from './black-hole.ts'
import { clamp, smoothstep } from './utils.ts'

// ── Stars ──
// Minimal: just tiny dots, no warm tinting, no parallax pull. Clean night sky.

export interface Star {
  x: number
  y: number
  size: number
  brightness: number
}

export function createStars(count: number, width: number, height: number): Star[] {
  const stars: Star[] = []
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.2 + 0.2,
      brightness: Math.random() * 0.3 + 0.05,
    })
  }
  return stars
}

export function drawStars(
  ctx: CanvasRenderingContext2D,
  stars: Star[],
  holes: BlackHole[],
) {
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i]!
    let alpha = s.brightness

    // Stars vanish inside black hole influence (swallowed by gravity)
    for (let h = 0; h < holes.length; h++) {
      const hole = holes[h]!
      if (!hole.alive) continue
      const dx = s.x - hole.x
      const dy = s.y - hole.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      alpha *= smoothstep(hole.eventHorizon, hole.influenceRadius * 0.6, dist)
    }

    if (alpha < 0.008) continue
    ctx.fillStyle = `rgba(255,255,255,${alpha})`
    ctx.fillRect(s.x, s.y, s.size, s.size) // squares, not circles — crisper, cheaper
  }
}

// ── Particles ──
// Minimal: only accretion particles close to the hole, and merge bursts.

export interface Particle {
  x: number
  y: number
  angle: number
  radius: number
  speed: number
  life: number
  maxLife: number
  size: number
  holeIndex: number
  type: 'accretion' | 'burst'
}

export function spawnParticles(holes: BlackHole[], existing: Particle[]): Particle[] {
  const particles = existing.filter(p => p.life < p.maxLife)

  for (let i = 0; i < holes.length; i++) {
    const hole = holes[i]!
    if (!hole.alive) continue

    // Sparse — only a few particles per hole
    if (particles.length > 150) break
    if (Math.random() > 0.06) continue

    const angle = Math.random() * Math.PI * 2
    // Particles orbit close to the event horizon, not spread wide
    const r = hole.eventHorizon * (1.5 + Math.random() * 2)
    particles.push({
      x: hole.x + Math.cos(angle) * r,
      y: hole.y + Math.sin(angle) * r,
      angle,
      radius: r,
      speed: (0.8 + Math.random() * 0.8) / Math.sqrt(hole.mass),
      life: 0,
      maxLife: 1.5 + Math.random() * 2,
      size: Math.random() * 1.2 + 0.3,
      holeIndex: i,
      type: 'accretion',
    })
  }

  return particles
}

export function spawnMergeBurst(
  particles: Particle[],
  event: MergeEvent,
  holeIndex: number,
): void {
  // Tight, controlled burst — not an explosion of confetti
  const count = Math.floor(15 + event.mass * 8)
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 1 + Math.random() * 2
    const r = 3 + Math.random() * 10
    particles.push({
      x: event.x + Math.cos(angle) * r,
      y: event.y + Math.sin(angle) * r,
      angle,
      radius: r,
      speed,
      life: 0,
      maxLife: 0.5 + Math.random() * 0.6,
      size: 0.8 + Math.random() * 1.5,
      holeIndex,
      type: 'burst',
    })
  }
}

export function updateParticles(particles: Particle[], holes: BlackHole[], dt: number) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!
    p.life += dt

    if (p.type === 'burst') {
      p.radius += p.speed * 50 * dt
      p.angle += 0.2 * dt
      p.speed *= 1 - 3 * dt
      const hole = holes[p.holeIndex]
      if (hole && hole.alive) {
        p.x = hole.x + Math.cos(p.angle) * p.radius
        p.y = hole.y + Math.sin(p.angle) * p.radius
      }
      continue
    }

    const hole = holes[p.holeIndex]
    if (!hole || !hole.alive) { p.life = p.maxLife; continue }

    p.angle += p.speed * dt
    p.radius *= 1 - 0.2 * dt  // spiral inward

    p.x = hole.x + Math.cos(p.angle) * p.radius
    p.y = hole.y + Math.sin(p.angle) * p.radius * 0.5 // elliptical
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!
    const t = p.life / p.maxLife
    const alpha = p.type === 'burst'
      ? (1 - t) * 0.9
      : (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85) * 0.5

    if (alpha < 0.01) continue

    // Single warm tone — no rainbow gradients
    ctx.fillStyle = `rgba(255,180,100,${alpha})`
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size * (1 - t * 0.3), 0, Math.PI * 2)
    ctx.fill()
  }
}

// ── Shockwave rings (merge events only) ──

export interface Shockwave {
  x: number
  y: number
  age: number
  maxAge: number
  maxRadius: number
}

let shockwaves: Shockwave[] = []

export function addShockwave(x: number, y: number, mass: number) {
  shockwaves.push({
    x, y,
    age: 0,
    maxAge: 1.2,
    maxRadius: 150 + mass * 60,
  })
}

export function updateShockwaves(dt: number) {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    shockwaves[i]!.age += dt
    if (shockwaves[i]!.age >= shockwaves[i]!.maxAge) {
      shockwaves.splice(i, 1)
    }
  }
}

export function drawShockwaves(ctx: CanvasRenderingContext2D) {
  for (const sw of shockwaves) {
    const t = sw.age / sw.maxAge
    const radius = sw.maxRadius * easeOutQuart(t)
    const alpha = (1 - t) * (1 - t) * 0.25

    if (alpha < 0.005) continue
    ctx.strokeStyle = `rgba(255,200,150,${alpha})`
    ctx.lineWidth = 1.5 * (1 - t) + 0.3
    ctx.beginPath()
    ctx.arc(sw.x, sw.y, radius, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function easeOutQuart(t: number): number {
  return 1 - (1 - t) ** 4
}

// ── Black Hole Rendering ──
// Clean: black core, thin photon ring, subtle accretion. No purple halos, no elastic bounce.

export function drawBlackHoles(ctx: CanvasRenderingContext2D, holes: BlackHole[], time: number) {
  for (let i = 0; i < holes.length; i++) {
    const hole = holes[i]!
    if (!hole.alive) continue

    const fadeIn = clamp(hole.age / 0.4, 0, 1)
    const scale = clamp(hole.spawnScale * 1.05 - 0.05, 0, 1) // simple ease, no elastic

    ctx.save()
    if (scale < 1) {
      ctx.translate(hole.x, hole.y)
      ctx.scale(scale, scale)
      ctx.translate(-hole.x, -hole.y)
    }

    // Accretion disk — single thin ellipse, not a big gradient blob
    ctx.save()
    ctx.translate(hole.x, hole.y)
    ctx.rotate(hole.accretionAngle)
    ctx.scale(1, 0.4)
    ctx.translate(-hole.x, -hole.y)

    const diskGrad = ctx.createRadialGradient(
      hole.x, hole.y, hole.eventHorizon * 0.9,
      hole.x, hole.y, hole.eventHorizon * 3,
    )
    diskGrad.addColorStop(0, `rgba(255,160,80,${0.12 * fadeIn})`)
    diskGrad.addColorStop(0.5, `rgba(255,120,50,${0.05 * fadeIn})`)
    diskGrad.addColorStop(1, 'rgba(255,100,40,0)')
    ctx.fillStyle = diskGrad
    ctx.beginPath()
    ctx.arc(hole.x, hole.y, hole.eventHorizon * 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Photon ring — single crisp ring
    ctx.strokeStyle = `rgba(255,180,110,${0.3 * fadeIn})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(hole.x, hole.y, hole.eventHorizon * 1.08, 0, Math.PI * 2)
    ctx.stroke()

    // Event horizon — solid black
    ctx.fillStyle = `rgba(0,0,0,${fadeIn})`
    ctx.beginPath()
    ctx.arc(hole.x, hole.y, hole.eventHorizon, 0, Math.PI * 2)
    ctx.fill()

    // Inspiral indicator: when this hole is being pulled toward another,
    // draw a faint connecting line (gravitational wave bridge)
    if (hole.inspiral > 0) {
      const partner = hole.inspiralPartner
      if (partner >= 0 && partner < holes.length) {
        const other = holes[partner]!
        if (other.alive) {
          const alpha = hole.inspiral * 0.12 * fadeIn
          ctx.strokeStyle = `rgba(255,200,150,${alpha})`
          ctx.lineWidth = 0.8
          ctx.setLineDash([2, 4])
          ctx.beginPath()
          ctx.moveTo(hole.x, hole.y)
          ctx.lineTo(other.x, other.y)
          ctx.stroke()
          ctx.setLineDash([])
        }
      }
    }

    // Merge shockwave ring on the hole itself
    if (hole.shockwave > 0) {
      const sw = hole.shockwave
      const r = hole.eventHorizon * (1 + sw * 5)
      const a = (1 - sw) * (1 - sw) * 0.4
      ctx.strokeStyle = `rgba(255,200,150,${a})`
      ctx.lineWidth = 2 * (1 - sw)
      ctx.beginPath()
      ctx.arc(hole.x, hole.y, r, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.restore()
  }
}

// ── Background ──
// Just a flat dark color. No nebula patches — that's the clutter.

export function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#08080e'
  ctx.fillRect(0, 0, width, height)
}

// ── Screen shake ──

export interface ScreenShake {
  intensity: number
  decay: number
  offsetX: number
  offsetY: number
}

export function createScreenShake(): ScreenShake {
  return { intensity: 0, decay: 0.9, offsetX: 0, offsetY: 0 }
}

export function triggerShake(shake: ScreenShake, intensity: number) {
  shake.intensity = Math.max(shake.intensity, intensity)
}

export function updateShake(shake: ScreenShake) {
  if (shake.intensity < 0.1) {
    shake.intensity = 0
    shake.offsetX = 0
    shake.offsetY = 0
    return
  }
  shake.offsetX = (Math.random() - 0.5) * shake.intensity * 2
  shake.offsetY = (Math.random() - 0.5) * shake.intensity * 2
  shake.intensity *= shake.decay
}
