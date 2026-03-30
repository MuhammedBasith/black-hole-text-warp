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

    // Find influence from closest black hole
    let closestDist = Infinity
    let closestHole: BlackHole | null = null
    let totalPullX = 0
    let totalPullY = 0

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

      // Gravitational pull on text position
      if (dist < hole.influenceRadius) {
        const strength = 1 - dist / hole.influenceRadius
        const pullMag = strength * strength * 15 * hole.mass
        totalPullX += (dx / dist) * pullMag
        totalPullY += (dy / dist) * pullMag
      }
    }

    if (!closestHole) {
      // No black holes — render normally
      ctx.globalAlpha = 0.88
      ctx.fillStyle = '#e8dcc8'
      ctx.fillText(line.text, line.x, line.y)
      continue
    }

    const distRatio = closestDist / closestHole.influenceRadius
    const inInfluence = distRatio < 1

    // Opacity: fade as text approaches event horizon
    const eventDist = closestDist / closestHole.eventHorizon
    const alpha = inInfluence
      ? clamp(smoothstep(0.8, 2.5, eventDist) * 0.92, 0, 0.92)
      : 0.88

    if (alpha < 0.01) continue

    // Color: gold → orange → red as it gets closer
    let hue: number, sat: number, lit: number
    if (inInfluence) {
      const t = 1 - distRatio
      hue = lerp(42, 5, t * t)
      sat = lerp(30, 85, t)
      lit = lerp(82, 60, t * 0.5)
    } else {
      hue = 42
      sat = 20
      lit = 82
    }

    // Rotation: subtle tilt toward the black hole
    const rotation = inInfluence
      ? (1 - distRatio) * (1 - distRatio) * 0.12 *
        Math.sign(closestHole.x - lineCenterX) *
        (closestHole.y > lineCenterY ? 1 : -1)
      : 0

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lit}%)`
    ctx.translate(line.x + totalPullX, line.y + totalPullY)
    if (Math.abs(rotation) > 0.001) {
      ctx.rotate(rotation)
    }
    ctx.fillText(line.text, 0, 0)
    ctx.restore()
  }
}
