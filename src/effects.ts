import type { BlackHole } from './black-hole.ts'
import { clamp, smoothstep } from './utils.ts'

// ── Stars ──

export interface Star {
  x: number
  y: number
  size: number
  brightness: number
  twinklePhase: number
  twinkleSpeed: number
}

export function createStars(count: number, width: number, height: number): Star[] {
  const stars: Star[] = []
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.8 + 0.3,
      brightness: Math.random() * 0.5 + 0.15,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: Math.random() * 2 + 0.5,
    })
  }
  return stars
}

export function drawStars(
  ctx: CanvasRenderingContext2D,
  stars: Star[],
  holes: BlackHole[],
  time: number,
) {
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i]!
    const twinkle = Math.sin(s.twinklePhase + time * s.twinkleSpeed) * 0.3 + 0.7
    let alpha = s.brightness * twinkle

    // Dim stars near black holes
    for (let h = 0; h < holes.length; h++) {
      const hole = holes[h]!
      if (!hole.alive) continue
      const dx = s.x - hole.x
      const dy = s.y - hole.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const fade = smoothstep(hole.eventHorizon * 0.5, hole.influenceRadius * 1.2, dist)
      alpha *= fade
    }

    if (alpha < 0.01) continue
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ── Particles ──

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
}

export function spawnParticles(holes: BlackHole[], existing: Particle[]): Particle[] {
  const particles = existing.filter(p => p.life < p.maxLife)

  for (let i = 0; i < holes.length; i++) {
    const hole = holes[i]!
    if (!hole.alive) continue

    // Spawn rate proportional to mass
    const rate = Math.floor(2 * hole.mass)
    for (let j = 0; j < rate; j++) {
      if (particles.length > 300) break
      if (Math.random() > 0.15) continue

      const angle = Math.random() * Math.PI * 2
      const r = hole.influenceRadius * (0.6 + Math.random() * 0.5)
      particles.push({
        x: hole.x + Math.cos(angle) * r,
        y: hole.y + Math.sin(angle) * r,
        angle,
        radius: r,
        speed: (0.8 + Math.random() * 1.2) / Math.sqrt(hole.mass),
        life: 0,
        maxLife: 2 + Math.random() * 3,
        size: Math.random() * 2 + 0.5,
        holeIndex: i,
      })
    }
  }

  return particles
}

export function updateParticles(particles: Particle[], holes: BlackHole[], dt: number) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!
    const hole = holes[p.holeIndex]
    if (!hole || !hole.alive) {
      p.life = p.maxLife
      continue
    }

    p.life += dt
    p.angle += p.speed * dt
    p.radius *= 1 - 0.15 * dt  // spiral inward

    p.x = hole.x + Math.cos(p.angle) * p.radius
    p.y = hole.y + Math.sin(p.angle) * p.radius * 0.6  // elliptical
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!
    const lifeRatio = p.life / p.maxLife
    const alpha = lifeRatio < 0.1
      ? lifeRatio / 0.1
      : 1 - (lifeRatio - 0.1) / 0.9
    if (alpha < 0.01) continue

    const hue = 30 + lifeRatio * 20  // orange → warm red
    ctx.fillStyle = `hsla(${hue}, 90%, ${65 - lifeRatio * 20}%, ${alpha * 0.8})`
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size * (1 - lifeRatio * 0.5), 0, Math.PI * 2)
    ctx.fill()
  }
}

// ── Black Hole Rendering ──

export function drawBlackHoles(ctx: CanvasRenderingContext2D, holes: BlackHole[], time: number) {
  for (let i = 0; i < holes.length; i++) {
    const hole = holes[i]!
    if (!hole.alive) continue

    const fadeIn = clamp(hole.age / 0.5, 0, 1)

    // Accretion disk glow (outer)
    const diskGrad = ctx.createRadialGradient(
      hole.x, hole.y, hole.eventHorizon * 0.8,
      hole.x, hole.y, hole.influenceRadius * 0.7,
    )
    diskGrad.addColorStop(0, `rgba(255, 140, 66, ${0.15 * fadeIn})`)
    diskGrad.addColorStop(0.4, `rgba(255, 100, 40, ${0.08 * fadeIn})`)
    diskGrad.addColorStop(1, 'rgba(255, 80, 30, 0)')

    ctx.save()
    ctx.translate(hole.x, hole.y)
    ctx.rotate(hole.accretionAngle)
    ctx.scale(1, 0.55) // flatten for perspective
    ctx.translate(-hole.x, -hole.y)
    ctx.fillStyle = diskGrad
    ctx.beginPath()
    ctx.arc(hole.x, hole.y, hole.influenceRadius * 0.7, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Inner glow ring
    const ringGrad = ctx.createRadialGradient(
      hole.x, hole.y, hole.eventHorizon * 0.9,
      hole.x, hole.y, hole.eventHorizon * 1.8,
    )
    ringGrad.addColorStop(0, `rgba(200, 120, 255, ${0.2 * fadeIn})`)
    ringGrad.addColorStop(0.5, `rgba(150, 80, 200, ${0.1 * fadeIn})`)
    ringGrad.addColorStop(1, 'rgba(100, 50, 150, 0)')
    ctx.fillStyle = ringGrad
    ctx.beginPath()
    ctx.arc(hole.x, hole.y, hole.eventHorizon * 1.8, 0, Math.PI * 2)
    ctx.fill()

    // Event horizon (black core)
    const coreGrad = ctx.createRadialGradient(
      hole.x, hole.y, 0,
      hole.x, hole.y, hole.eventHorizon,
    )
    coreGrad.addColorStop(0, `rgba(0, 0, 0, ${fadeIn})`)
    coreGrad.addColorStop(0.7, `rgba(5, 2, 10, ${fadeIn})`)
    coreGrad.addColorStop(1, `rgba(15, 5, 25, ${0.9 * fadeIn})`)
    ctx.fillStyle = coreGrad
    ctx.beginPath()
    ctx.arc(hole.x, hole.y, hole.eventHorizon, 0, Math.PI * 2)
    ctx.fill()

    // Subtle pulsing highlight
    const pulse = Math.sin(time * 2 + i) * 0.5 + 0.5
    ctx.strokeStyle = `rgba(180, 120, 255, ${0.08 * pulse * fadeIn})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(hole.x, hole.y, hole.eventHorizon * 1.05, 0, Math.PI * 2)
    ctx.stroke()
  }
}

// ── Nebula background ──

export function drawNebula(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Subtle colored nebula patches
  const patches = [
    { x: width * 0.2, y: height * 0.3, r: 300, h: 270, s: 40, l: 8, a: 0.04 },
    { x: width * 0.8, y: height * 0.7, r: 250, h: 330, s: 30, l: 6, a: 0.03 },
    { x: width * 0.5, y: height * 0.5, r: 400, h: 220, s: 25, l: 5, a: 0.02 },
  ]

  for (const p of patches) {
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
    grad.addColorStop(0, `hsla(${p.h}, ${p.s}%, ${p.l}%, ${p.a})`)
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, width, height)
  }
}
