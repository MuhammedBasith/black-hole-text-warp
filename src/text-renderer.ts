import type { BlackHole } from './black-hole.ts'
import type { PositionedLine } from './text-layout.ts'
import { BODY_FONT, BODY_LINE_HEIGHT } from './content.ts'
import { clamp, smoothstep, lerp } from './utils.ts'

export function drawTextLines(
  ctx: CanvasRenderingContext2D,
  lines: PositionedLine[],
  holes: BlackHole[],
  _time: number,
) {
  ctx.font = BODY_FONT
  ctx.textBaseline = 'top'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const cx = line.x + line.width / 2
    const cy = line.y + BODY_LINE_HEIGHT / 2

    // Find closest hole and accumulate gravitational pull
    let closestDist = Infinity
    let closestHole: BlackHole | null = null
    let pullX = 0, pullY = 0

    for (let h = 0; h < holes.length; h++) {
      const hole = holes[h]!
      if (!hole.alive) continue
      const dx = hole.x - cx, dy = hole.y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < closestDist) { closestDist = dist; closestHole = hole }
      if (dist < hole.influenceRadius) {
        const t = 1 - dist / hole.influenceRadius
        const mag = t * t * 12 * hole.mass
        pullX += (dx / dist) * mag
        pullY += (dy / dist) * mag * 0.4
      }
    }

    // No holes: default render
    if (!closestHole) {
      ctx.globalAlpha = 0.82
      ctx.fillStyle = '#c8c0b0'
      ctx.fillText(line.text, line.x, line.y)
      continue
    }

    const ratio = closestDist / closestHole.influenceRadius
    const near = ratio < 1

    // Opacity — fade cleanly toward event horizon
    const ehDist = closestDist / closestHole.eventHorizon
    const alpha = near
      ? clamp(smoothstep(0.5, 3, ehDist) * 0.85, 0, 0.85)
      : 0.82
    if (alpha < 0.01) continue

    // Color — subtle warm shift, not a rainbow
    // Default: muted warm gray. Near hole: slightly warmer, that's it.
    let color: string
    if (near) {
      const t = 1 - ratio
      const r = Math.round(lerp(200, 235, t * t))
      const g = Math.round(lerp(192, 165, t))
      const b = Math.round(lerp(176, 130, t))
      color = `rgb(${r},${g},${b})`
    } else {
      color = '#c8c0b0'
    }

    // Rotation — very subtle tilt
    let rotation = 0
    if (near) {
      const angle = Math.atan2(closestHole.y - cy, closestHole.x - cx)
      rotation = Math.sin(angle) * (1 - ratio) ** 2 * 0.06
    }

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.translate(line.x + pullX, line.y + pullY)
    if (Math.abs(rotation) > 0.0003) {
      ctx.translate(line.width / 2, BODY_LINE_HEIGHT / 2)
      ctx.rotate(rotation)
      ctx.translate(-line.width / 2, -BODY_LINE_HEIGHT / 2)
    }
    ctx.fillText(line.text, 0, 0)
    ctx.restore()
  }
}
