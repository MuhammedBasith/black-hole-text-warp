import type { BlackHole, MergeEvent } from './black-hole.ts'
import { clamp, smoothstep, lerp } from './utils.ts'

// ── Stars ──

export interface Star {
  x: number
  y: number
  size: number
  brightness: number
  twinklePhase: number
  twinkleSpeed: number
  baseX: number
  baseY: number
}

export function createStars(count: number, width: number, height: number): Star[] {
  const stars: Star[] = []
  for (let i = 0; i < count; i++) {
    const x = Math.random() * width
    const y = Math.random() * height
    stars.push({
      x, y, baseX: x, baseY: y,
      size: Math.random() * 1.6 + 0.2,
      brightness: Math.random() * 0.45 + 0.1,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: Math.random() * 1.5 + 0.3,
    })
  }
  return stars
}

export function updateStars(stars: Star[], holes: BlackHole[], dt: number) {
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i]!
    // Stars get pulled toward black holes (parallax effect)
    let pullX = 0, pullY = 0
    for (let h = 0; h < holes.length; h++) {
      const hole = holes[h]!
      if (!hole.alive) continue
      const dx = hole.x - s.baseX
      const dy = hole.y - s.baseY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < hole.influenceRadius * 2) {
        const strength = 1 - dist / (hole.influenceRadius * 2)
        pullX += dx * strength * strength * 0.15
        pullY += dy * strength * strength * 0.15
      }
    }
    s.x = s.baseX + pullX
    s.y = s.baseY + pullY
  }
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
      const fade = smoothstep(hole.eventHorizon * 0.3, hole.influenceRadius, dist)
      alpha *= fade
    }

    if (alpha < 0.01) continue

    // Slight warm tint for some stars
    const warm = (i % 5 === 0)
    if (warm) {
      ctx.fillStyle = `rgba(255, 240, 220, ${alpha})`
    } else {
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
    }
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
  type: 'accretion' | 'burst'
}

export function spawnParticles(holes: BlackHole[], existing: Particle[]): Particle[] {
  const particles = existing.filter(p => p.life < p.maxLife)

  for (let i = 0; i < holes.length; i++) {
    const hole = holes[i]!
    if (!hole.alive) continue

    const rate = Math.floor(3 * hole.mass)
    for (let j = 0; j < rate; j++) {
      if (particles.length > 400) break
      if (Math.random() > 0.12) continue

      const angle = Math.random() * Math.PI * 2
      const r = hole.influenceRadius * (0.5 + Math.random() * 0.6)
      particles.push({
        x: hole.x + Math.cos(angle) * r,
        y: hole.y + Math.sin(angle) * r,
        angle,
        radius: r,
        speed: (0.6 + Math.random() * 1.0) / Math.sqrt(hole.mass),
        life: 0,
        maxLife: 2.5 + Math.random() * 3.5,
        size: Math.random() * 1.8 + 0.4,
        holeIndex: i,
        type: 'accretion',
      })
    }
  }

  return particles
}

export function spawnMergeBurst(
  particles: Particle[],
  event: MergeEvent,
  holeIndex: number,
): void {
  const count = Math.floor(30 + event.mass * 15)
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 1.5 + Math.random() * 3
    const r = 5 + Math.random() * 20
    particles.push({
      x: event.x + Math.cos(angle) * r,
      y: event.y + Math.sin(angle) * r,
      angle,
      radius: r,
      speed,
      life: 0,
      maxLife: 0.8 + Math.random() * 1.2,
      size: 1 + Math.random() * 3,
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
      // Burst particles fly outward and decelerate
      p.radius += p.speed * 40 * dt
      p.angle += 0.3 * dt
      p.speed *= 1 - 2 * dt
      const hole = holes[p.holeIndex]
      if (hole && hole.alive) {
        p.x = hole.x + Math.cos(p.angle) * p.radius
        p.y = hole.y + Math.sin(p.angle) * p.radius
      }
      continue
    }

    const hole = holes[p.holeIndex]
    if (!hole || !hole.alive) {
      p.life = p.maxLife
      continue
    }

    p.angle += p.speed * dt
    p.radius *= 1 - 0.12 * dt

    p.x = hole.x + Math.cos(p.angle) * p.radius
    p.y = hole.y + Math.sin(p.angle) * p.radius * 0.55
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!
    const lifeRatio = p.life / p.maxLife
    let alpha: number

    if (p.type === 'burst') {
      alpha = 1 - lifeRatio
      const hue = 35 + lifeRatio * 10
      ctx.fillStyle = `hsla(${hue}, 95%, ${75 - lifeRatio * 30}%, ${alpha * 0.9})`
    } else {
      alpha = lifeRatio < 0.1 ? lifeRatio / 0.1 : 1 - (lifeRatio - 0.1) / 0.9
      if (alpha < 0.01) continue
      const hue = 30 + lifeRatio * 25
      ctx.fillStyle = `hsla(${hue}, 90%, ${65 - lifeRatio * 20}%, ${alpha * 0.7})`
    }

    if (alpha < 0.01) continue
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size * (1 - lifeRatio * 0.4), 0, Math.PI * 2)
    ctx.fill()
  }
}

// ── Shockwave rings ──

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
    maxAge: 1.5,
    maxRadius: 200 + mass * 80,
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
  for (let i = 0; i < shockwaves.length; i++) {
    const sw = shockwaves[i]!
    const t = sw.age / sw.maxAge
    const radius = sw.maxRadius * easeOutCubic(t)
    const alpha = (1 - t) * 0.3

    ctx.strokeStyle = `rgba(200, 160, 255, ${alpha})`
    ctx.lineWidth = 2 * (1 - t) + 0.5
    ctx.beginPath()
    ctx.arc(sw.x, sw.y, radius, 0, Math.PI * 2)
    ctx.stroke()

    // Second ring, slightly delayed
    if (t > 0.1) {
      const t2 = (t - 0.1) / 0.9
      const r2 = sw.maxRadius * 0.7 * easeOutCubic(t2)
      const a2 = (1 - t2) * 0.15
      ctx.strokeStyle = `rgba(255, 180, 120, ${a2})`
      ctx.lineWidth = 1.5 * (1 - t2)
      ctx.beginPath()
      ctx.arc(sw.x, sw.y, r2, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

// ── Gravitational wave ripples (always active near holes) ──

export function drawGravitationalWaves(
  ctx: CanvasRenderingContext2D,
  holes: BlackHole[],
  time: number,
) {
  for (let i = 0; i < holes.length; i++) {
    const hole = holes[i]!
    if (!hole.alive) continue
    const fadeIn = clamp(hole.age / 1, 0, 1)

    // Draw 3 concentric ripple rings that pulse outward
    for (let ring = 0; ring < 3; ring++) {
      const phase = (time * 0.4 + ring * 0.33) % 1
      const radius = hole.eventHorizon * 1.5 + phase * hole.influenceRadius * 0.8
      const alpha = (1 - phase) * 0.04 * fadeIn * hole.mass

      if (alpha < 0.005) continue
      ctx.strokeStyle = `rgba(180, 150, 255, ${alpha})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(hole.x, hole.y, radius, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
}

// ── Black Hole Rendering ──

export function drawBlackHoles(ctx: CanvasRenderingContext2D, holes: BlackHole[], time: number) {
  for (let i = 0; i < holes.length; i++) {
    const hole = holes[i]!
    if (!hole.alive) continue

    const fadeIn = clamp(hole.age / 0.6, 0, 1)
    const scale = easeOutElastic(hole.spawnScale)

    ctx.save()
    ctx.translate(hole.x, hole.y)
    ctx.scale(scale, scale)
    ctx.translate(-hole.x, -hole.y)

    // Accretion disk glow (outer) — flattened ellipse
    const diskGrad = ctx.createRadialGradient(
      hole.x, hole.y, hole.eventHorizon * 0.6,
      hole.x, hole.y, hole.influenceRadius * 0.65,
    )
    diskGrad.addColorStop(0, `rgba(255, 140, 66, ${0.18 * fadeIn})`)
    diskGrad.addColorStop(0.3, `rgba(255, 100, 40, ${0.1 * fadeIn})`)
    diskGrad.addColorStop(0.7, `rgba(200, 60, 20, ${0.04 * fadeIn})`)
    diskGrad.addColorStop(1, 'rgba(200, 50, 20, 0)')

    ctx.save()
    ctx.translate(hole.x, hole.y)
    ctx.rotate(hole.accretionAngle)
    ctx.scale(1, 0.5)
    ctx.translate(-hole.x, -hole.y)
    ctx.fillStyle = diskGrad
    ctx.beginPath()
    ctx.arc(hole.x, hole.y, hole.influenceRadius * 0.65, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Photon ring — bright thin ring at event horizon edge
    const photonGrad = ctx.createRadialGradient(
      hole.x, hole.y, hole.eventHorizon * 0.92,
      hole.x, hole.y, hole.eventHorizon * 1.25,
    )
    photonGrad.addColorStop(0, `rgba(255, 200, 130, ${0.0 * fadeIn})`)
    photonGrad.addColorStop(0.4, `rgba(255, 180, 100, ${0.25 * fadeIn})`)
    photonGrad.addColorStop(0.6, `rgba(255, 150, 80, ${0.15 * fadeIn})`)
    photonGrad.addColorStop(1, 'rgba(255, 120, 60, 0)')
    ctx.fillStyle = photonGrad
    ctx.beginPath()
    ctx.arc(hole.x, hole.y, hole.eventHorizon * 1.25, 0, Math.PI * 2)
    ctx.fill()

    // Inner glow ring (purple/violet)
    const ringGrad = ctx.createRadialGradient(
      hole.x, hole.y, hole.eventHorizon * 0.85,
      hole.x, hole.y, hole.eventHorizon * 2,
    )
    ringGrad.addColorStop(0, `rgba(180, 100, 255, ${0.12 * fadeIn})`)
    ringGrad.addColorStop(0.5, `rgba(120, 60, 200, ${0.06 * fadeIn})`)
    ringGrad.addColorStop(1, 'rgba(80, 40, 150, 0)')
    ctx.fillStyle = ringGrad
    ctx.beginPath()
    ctx.arc(hole.x, hole.y, hole.eventHorizon * 2, 0, Math.PI * 2)
    ctx.fill()

    // Event horizon (black core)
    const coreGrad = ctx.createRadialGradient(
      hole.x, hole.y, 0,
      hole.x, hole.y, hole.eventHorizon,
    )
    coreGrad.addColorStop(0, `rgba(0, 0, 0, ${fadeIn})`)
    coreGrad.addColorStop(0.75, `rgba(2, 1, 5, ${fadeIn})`)
    coreGrad.addColorStop(1, `rgba(8, 3, 15, ${0.95 * fadeIn})`)
    ctx.fillStyle = coreGrad
    ctx.beginPath()
    ctx.arc(hole.x, hole.y, hole.eventHorizon, 0, Math.PI * 2)
    ctx.fill()

    // Merge shockwave flash
    if (hole.shockwave > 0) {
      const sw = hole.shockwave
      const shockRadius = hole.eventHorizon * (1 + sw * 4)
      const shockAlpha = (1 - sw) * 0.5
      ctx.strokeStyle = `rgba(255, 200, 150, ${shockAlpha})`
      ctx.lineWidth = 3 * (1 - sw)
      ctx.beginPath()
      ctx.arc(hole.x, hole.y, shockRadius, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.restore()
  }
}

function easeOutElastic(t: number): number {
  if (t === 0 || t === 1) return t
  return Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1
}

// ── Nebula background ──

export function drawNebula(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const patches = [
    { x: width * 0.15, y: height * 0.25, r: 350, h: 265, s: 35, l: 6, a: 0.035 },
    { x: width * 0.85, y: height * 0.75, r: 280, h: 325, s: 25, l: 5, a: 0.025 },
    { x: width * 0.55, y: height * 0.45, r: 450, h: 215, s: 20, l: 4, a: 0.018 },
    { x: width * 0.3, y: height * 0.8, r: 200, h: 20, s: 30, l: 5, a: 0.02 },
  ]

  for (const p of patches) {
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
    grad.addColorStop(0, `hsla(${p.h}, ${p.s}%, ${p.l}%, ${p.a})`)
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, width, height)
  }
}

// ── Screen shake ──

export interface ScreenShake {
  intensity: number
  decay: number
  offsetX: number
  offsetY: number
}

export function createScreenShake(): ScreenShake {
  return { intensity: 0, decay: 0.92, offsetX: 0, offsetY: 0 }
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
