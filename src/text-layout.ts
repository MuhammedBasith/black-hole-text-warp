import {
  prepareWithSegments,
  layoutNextLine,
  type PreparedTextWithSegments,
  type LayoutCursor,
  type LayoutLine,
} from '@chenglou/pretext'
import type { BlackHole } from './black-hole.ts'
import { BODY_FONT, BODY_LINE_HEIGHT, MIN_SLOT_WIDTH } from './content.ts'

type Interval = { left: number; right: number }

export type PositionedLine = {
  text: string
  x: number
  y: number
  width: number
}

let prepared: PreparedTextWithSegments | null = null

export function prepareText(text: string) {
  prepared = prepareWithSegments(text, BODY_FONT)
}

function circleIntervalForBand(
  cx: number, cy: number, r: number,
  bandTop: number, bandBottom: number,
  padding: number,
): Interval | null {
  const top = bandTop - padding
  const bottom = bandBottom + padding
  if (top >= cy + r || bottom <= cy - r) return null
  const minDy = cy >= top && cy <= bottom ? 0 : cy < top ? top - cy : cy - bottom
  if (minDy >= r) return null
  const maxDx = Math.sqrt(r * r - minDy * minDy)
  return { left: cx - maxDx - padding, right: cx + maxDx + padding }
}

function carveSlots(base: Interval, blocked: Interval[]): Interval[] {
  let slots = [base]
  for (let i = 0; i < blocked.length; i++) {
    const interval = blocked[i]!
    const next: Interval[] = []
    for (let j = 0; j < slots.length; j++) {
      const slot = slots[j]!
      if (interval.right <= slot.left || interval.left >= slot.right) {
        next.push(slot)
        continue
      }
      if (interval.left > slot.left) next.push({ left: slot.left, right: interval.left })
      if (interval.right < slot.right) next.push({ left: interval.right, right: slot.right })
    }
    slots = next
  }
  return slots.filter(s => s.right - s.left >= MIN_SLOT_WIDTH)
}

export type ColumnConfig = {
  x: number
  width: number
  startY: number
  endY: number
}

export function layoutColumns(
  holes: BlackHole[],
  columns: ColumnConfig[],
): PositionedLine[] {
  if (!prepared) return []

  const lines: PositionedLine[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let textExhausted = false

  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    if (textExhausted) break
    const col = columns[colIdx]!
    let y = col.startY

    while (y + BODY_LINE_HEIGHT <= col.endY) {
      if (textExhausted) break
      const bandTop = y
      const bandBottom = y + BODY_LINE_HEIGHT

      // Compute blocked intervals from all black holes
      const blocked: Interval[] = []
      for (let h = 0; h < holes.length; h++) {
        const hole = holes[h]!
        if (!hole.alive) continue
        const interval = circleIntervalForBand(
          hole.x, hole.y, hole.influenceRadius,
          bandTop, bandBottom, 8,
        )
        if (interval) blocked.push(interval)
      }

      const base: Interval = { left: col.x, right: col.x + col.width }
      const slots = carveSlots(base, blocked)

      if (slots.length === 0) {
        y += BODY_LINE_HEIGHT
        continue
      }

      // Use the widest slot
      let bestSlot = slots[0]!
      for (let s = 1; s < slots.length; s++) {
        const slot = slots[s]!
        if (slot.right - slot.left > bestSlot.right - bestSlot.left) {
          bestSlot = slot
        }
      }

      const slotWidth = bestSlot.right - bestSlot.left
      const line = layoutNextLine(prepared, cursor, slotWidth)
      if (line === null) {
        textExhausted = true
        break
      }

      lines.push({
        text: line.text,
        x: bestSlot.left,
        y: y,
        width: line.width,
      })
      cursor = line.end
      y += BODY_LINE_HEIGHT
    }
  }

  return lines
}
