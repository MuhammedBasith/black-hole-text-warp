import type { BlackHole } from './black-hole.ts'
import type { PositionedLine, DropCapInfo } from './text-layout.ts'
import { BODY_FONT, BODY_LINE_HEIGHT } from './content.ts'
import { clamp, smoothstep, lerp } from './utils.ts'

const TEXT_COLOR = '#c4b8a8'

export function drawDropCap(
  ctx: CanvasRenderingContext2D,
  dropCap: DropCapInfo,
  holes: BlackHole[],
) {
  if (!dropCap) return

  ctx.save()
  ctx.font = dropCap.font
  ctx.textBaseline = 'top'

  // Check if any black hole is near the drop cap
  let alpha = 0.6
  let color = TEXT_COLOR
  const cx = dropCap.x + dropCap.size * 0.36
  const cy = dropCap.y + dropCap.size * 0.5

  for (let h = 0; h < holes.length; h++) {
    const hole = holes[h]!
    if (!hole.alive) continue
    const dx = hole.x - cx, dy = hole.y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < hole.exclusionRadius * 1.5) {
      const t = 1 - dist / (hole.exclusionRadius * 1.5)
      alpha *= 1 - t * 0.6
      const r = Math.round(lerp(196, 220, t * t))
      const g = Math.round(lerp(184, 170, t))
      const b = Math.round(lerp(168, 140, t))
      color = `rgb(${r},${g},${b})`
    }
  }

  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  // Slight Y offset to align baseline with the 3rd line's baseline
  ctx.fillText(dropCap.letter, dropCap.x, dropCap.y - dropCap.size * 0.08)
  ctx.restore()
}

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

    let closestDist = Infinity
    let closestHole: BlackHole | null = null
    let pullX = 0, pullY = 0

    for (let h = 0; h < holes.length; h++) {
      const hole = holes[h]!
      if (!hole.alive) continue
      const dx = hole.x - cx, dy = hole.y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < closestDist) { closestDist = dist; closestHole = hole }

      const pullZone = hole.exclusionRadius * 1.3
      if (dist < pullZone) {
        const t = 1 - dist / pullZone
        const mag = t * t * 8 * hole.mass
        pullX += (dx / dist) * mag
        pullY += (dy / dist) * mag * 0.3
      }
    }

    if (!closestHole) {
      ctx.globalAlpha = 0.68
      ctx.fillStyle = TEXT_COLOR
      ctx.fillText(line.text, line.x, line.y)
      continue
    }

    const zoneRatio = closestDist / (closestHole.exclusionRadius * 1.3)
    const near = zoneRatio < 1

    const ehDist = closestDist / closestHole.eventHorizon
    const alpha = near
      ? clamp(smoothstep(0.8, 4, ehDist) * 0.72, 0, 0.72)
      : 0.68
    if (alpha < 0.01) continue

    let color: string
    if (near) {
      const t = 1 - zoneRatio
      const r = Math.round(lerp(196, 220, t * t))
      const g = Math.round(lerp(184, 170, t))
      const b = Math.round(lerp(168, 140, t))
      color = `rgb(${r},${g},${b})`
    } else {
      color = TEXT_COLOR
    }

    let rotation = 0
    if (near) {
      const angle = Math.atan2(closestHole.y - cy, closestHole.x - cx)
      rotation = Math.sin(angle) * (1 - zoneRatio) ** 2 * 0.04
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
