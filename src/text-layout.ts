import {
  prepareWithSegments,
  layoutNextLine,
  type PreparedTextWithSegments,
  type LayoutCursor,
} from '@chenglou/pretext'
import type { BlackHole } from './black-hole.ts'
import {
  BODY_FONT, BODY_LINE_HEIGHT, MIN_SLOT_WIDTH,
  DROP_CAP_LINES, DROP_CAP_FONT_TEMPLATE, PARAGRAPH_SPACING,
} from './content.ts'

type Interval = { left: number; right: number }

export type PositionedLine = {
  text: string
  x: number
  y: number
  width: number
}

export type DropCapInfo = {
  letter: string
  x: number
  y: number
  font: string
  size: number
} | null

// Prepared paragraphs
let preparedParagraphs: PreparedTextWithSegments[] = []
let dropCapLetter = ''

export function prepareText(paragraphs: string[]) {
  if (paragraphs.length === 0) return
  // First paragraph: strip first letter for drop cap
  dropCapLetter = paragraphs[0]![0] || ''
  const firstRest = paragraphs[0]!.slice(1)

  preparedParagraphs = [
    prepareWithSegments(firstRest, BODY_FONT),
    ...paragraphs.slice(1).map(p => prepareWithSegments(p, BODY_FONT)),
  ]
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
  for (const interval of blocked) {
    const next: Interval[] = []
    for (const slot of slots) {
      if (interval.right <= slot.left || interval.left >= slot.right) { next.push(slot); continue }
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

export type LayoutResult = {
  lines: PositionedLine[]
  dropCap: DropCapInfo
}

export function layoutColumns(
  holes: BlackHole[],
  columns: ColumnConfig[],
): LayoutResult {
  if (preparedParagraphs.length === 0) return { lines: [], dropCap: null }

  const lines: PositionedLine[] = []
  let globalLineIdx = 0

  // Drop cap dimensions
  const dropCapSize = BODY_LINE_HEIGHT * DROP_CAP_LINES * 0.92
  const dropCapWidth = dropCapSize * 0.65 + 8

  let dropCap: DropCapInfo = null
  let paraIdx = 0
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let allDone = false

  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    if (allDone) break
    const col = columns[colIdx]!
    let y = col.startY

    while (y + BODY_LINE_HEIGHT <= col.endY) {
      if (allDone) break

      const bandTop = y
      const bandBottom = y + BODY_LINE_HEIGHT

      // Black hole exclusions
      const blocked: Interval[] = []
      for (const hole of holes) {
        if (!hole.alive) continue
        const interval = circleIntervalForBand(hole.x, hole.y, hole.exclusionRadius, bandTop, bandBottom, 6)
        if (interval) blocked.push(interval)
      }

      // Drop cap exclusion for first few lines of first column
      const inDropCapZone = colIdx === 0 && globalLineIdx < DROP_CAP_LINES
      if (inDropCapZone) {
        blocked.push({ left: col.x - 5, right: col.x + dropCapWidth })
      }

      const base: Interval = { left: col.x, right: col.x + col.width }
      const slots = carveSlots(base, blocked)

      if (slots.length === 0) {
        y += BODY_LINE_HEIGHT
        globalLineIdx++
        continue
      }

      // Widest slot
      let bestSlot = slots[0]!
      for (let s = 1; s < slots.length; s++) {
        const slot = slots[s]!
        if (slot.right - slot.left > bestSlot.right - bestSlot.left) bestSlot = slot
      }

      const prepared = preparedParagraphs[paraIdx]!
      const line = layoutNextLine(prepared, cursor, bestSlot.right - bestSlot.left)

      if (line === null) {
        // Paragraph exhausted — move to next
        paraIdx++
        cursor = { segmentIndex: 0, graphemeIndex: 0 }
        if (paraIdx >= preparedParagraphs.length) { allDone = true; break }
        // Add paragraph spacing
        y += PARAGRAPH_SPACING
        continue
      }

      lines.push({ text: line.text, x: bestSlot.left, y, width: line.width })
      cursor = line.end
      y += BODY_LINE_HEIGHT
      globalLineIdx++
    }
  }

  // Drop cap info
  if (dropCapLetter && columns.length > 0) {
    const col = columns[0]!
    dropCap = {
      letter: dropCapLetter,
      x: col.x,
      y: col.startY,
      font: DROP_CAP_FONT_TEMPLATE.replace('{{SIZE}}', String(Math.round(dropCapSize))),
      size: dropCapSize,
    }
  }

  return { lines, dropCap }
}
