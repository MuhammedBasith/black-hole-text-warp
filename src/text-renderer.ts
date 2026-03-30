import type { BlackHole } from './black-hole.ts'
import type { PositionedLine } from './text-layout.ts'
import { BODY_FONT, BODY_LINE_HEIGHT } from './content.ts'
import { clamp, smoothstep, lerp } from './utils.ts'

export function drawTextLines(
  ctx: CanvasRenderingContext2D,
  lines: PositionedLine[],
  holes: BlackHole[],
  time: number,
) {
  ctx.font = BODY_FONT
  ctx.textBaseline = 'top'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const lineCenterX = line.x + line.width / 2
    const lineCenterY = line.y + BODY_LINE_HEIGHT / 2

    // Accumulate influence from all black holes
    let closestDist = Infinity
    let closestHole: BlackHole | null = null
    let totalPullX = 0
    let totalPullY = 0
    let maxInfluence = 0  // 0..1, how strongly any hole affects this line

    for (let h = 0; h < holes.length; h++) {
      const hole = holes[h]!
      if (!hole.alive) continue

      const dx = hole.x - lineCenterX
      const dy = hole.y - lineCenterY
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < closestDist) {
        closestDist = dist
        closestHole = hole
      }

      if (dist < hole.influenceRadius) {
        const influence = 1 - dist / hole.influenceRadius
        maxInfluence = Math.max(maxInfluence, influence)
        const pullMag = influence * influence * 18 * hole.mass
        totalPullX += (dx / dist) * pullMag
        totalPullY += (dy / dist) * pullMag * 0.5  // less vertical pull
      }
    }

    if (!closestHole) {
      // No black holes — clean default rendering
      ctx.globalAlpha = 0.85
      ctx.fillStyle = '#ddd5c4'
      ctx.fillText(line.text, line.x, line.y)
      continue
    }

    const distRatio = closestDist / closestHole.influenceRadius
    const inInfluence = distRatio < 1

    // Opacity: smooth fade toward event horizon
    const eventDist = closestDist / closestHole.eventHorizon
    const alpha = inInfluence
      ? clamp(smoothstep(0.6, 3.0, eventDist) * 0.88, 0, 0.88)
      : 0.85

    if (alpha < 0.01) continue

    // Color: warm white → gold → amber → deep orange near the hole
    let r: number, g: number, b: number
    if (inInfluence) {
      const t = (1 - distRatio)
      // Warm white → gold → orange → deep amber
      r = Math.round(lerp(221, 255, Math.min(t * 1.5, 1)))
      g = Math.round(lerp(213, 140 - t * 40, t))
      b = Math.round(lerp(196, 50 - t * 30, t))
    } else {
      r = 221; g = 213; b = 196
    }

    // Rotation: lines tilt toward the singularity
    let rotation = 0
    if (inInfluence) {
      const angle = Math.atan2(closestHole.y - lineCenterY, closestHole.x - lineCenterX)
      const strength = (1 - distRatio) * (1 - distRatio)
      rotation = Math.sin(angle) * strength * 0.08
    }

    // Scale distortion: slight stretch as text approaches
    const scaleX = inInfluence ? 1 + (1 - distRatio) * (1 - distRatio) * 0.04 : 1

    ctx.save()
    ctx.globalAlpha = alpha

    // Text shadow glow when very close to a hole
    if (inInfluence && distRatio < 0.5) {
      const glowStrength = (0.5 - distRatio) * 2
      ctx.shadowColor = `rgba(255, 150, 60, ${glowStrength * 0.3})`
      ctx.shadowBlur = 8 * glowStrength
    }

    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
    ctx.translate(line.x + totalPullX, line.y + totalPullY)

    if (Math.abs(rotation) > 0.0005 || scaleX !== 1) {
      ctx.translate(line.width / 2, BODY_LINE_HEIGHT / 2)
      ctx.rotate(rotation)
      ctx.scale(scaleX, 1)
      ctx.translate(-line.width / 2, -BODY_LINE_HEIGHT / 2)
    }

    ctx.fillText(line.text, 0, 0)

    // Reset shadow
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0

    ctx.restore()
  }
}
