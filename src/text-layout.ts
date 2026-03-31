import {
  prepareWithSegments,
  layoutNextLine,
  type PreparedTextWithSegments,
  type LayoutCursor,
} from '@chenglou/pretext'
import type { BlackHole } from './black-hole.ts'
import {
  getBodyFont, getLineHeight, getDropCapLines, getDropCapFont,
  getParagraphSpacing, MIN_SLOT_WIDTH,
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

// State — re-prepared on resize
let preparedParagraphs: PreparedTextWithSegments[] = []
let dropCapLetter = ''
let currentFont = ''
let currentLineHeight = 26
let currentDropCapLines = 3
let currentParaSpacing = 12

export function prepareText(paragraphs: string[], screenW: number) {
  if (paragraphs.length === 0) return

  currentFont = getBodyFont(screenW)
  currentLineHeight = getLineHeight(screenW)
  currentDropCapLines = getDropCapLines(screenW)
  currentParaSpacing = getParagraphSpacing(screenW)

  dropCapLetter = paragraphs[0]![0] || ''
  const firstRest = paragraphs[0]!.slice(1)

  preparedParagraphs = [
    prepareWithSegments(firstRest, currentFont),
    ...paragraphs.slice(1).map(p => prepareWithSegments(p, currentFont)),
  ]
}

export function getCurrentFont(): string { return currentFont }
export function getCurrentLineHeight(): number { return currentLineHeight }

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

  const lh = currentLineHeight
  const lines: PositionedLine[] = []
  let globalLineIdx = 0

  const dropCapSize = lh * currentDropCapLines * 0.92
  const dropCapWidth = dropCapSize * 0.65 + 6

  let dropCap: DropCapInfo = null
  let paraIdx = 0
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let allDone = false

  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    if (allDone) break
    const col = columns[colIdx]!
    let y = col.startY

    while (y + lh <= col.endY) {
      if (allDone) break

      const blocked: Interval[] = []
      for (const hole of holes) {
        if (!hole.alive) continue
        const interval = circleIntervalForBand(hole.x, hole.y, hole.exclusionRadius, y, y + lh, 6)
        if (interval) blocked.push(interval)
      }

      const inDropCapZone = colIdx === 0 && globalLineIdx < currentDropCapLines
      if (inDropCapZone) {
        blocked.push({ left: col.x - 5, right: col.x + dropCapWidth })
      }

      const slots = carveSlots({ left: col.x, right: col.x + col.width }, blocked)
      if (slots.length === 0) { y += lh; globalLineIdx++; continue }

      let bestSlot = slots[0]!
      for (let s = 1; s < slots.length; s++) {
        const slot = slots[s]!
        if (slot.right - slot.left > bestSlot.right - bestSlot.left) bestSlot = slot
      }

      const prepared = preparedParagraphs[paraIdx]!
      const line = layoutNextLine(prepared, cursor, bestSlot.right - bestSlot.left)

      if (line === null) {
        paraIdx++
        cursor = { segmentIndex: 0, graphemeIndex: 0 }
        if (paraIdx >= preparedParagraphs.length) { allDone = true; break }
        y += currentParaSpacing
        continue
      }

      lines.push({ text: line.text, x: bestSlot.left, y, width: line.width })
      cursor = line.end
      y += lh
      globalLineIdx++
    }
  }

  if (dropCapLetter && columns.length > 0) {
    const col = columns[0]!
    dropCap = {
      letter: dropCapLetter,
      x: col.x,
      y: col.startY,
      font: getDropCapFont(dropCapSize),
      size: dropCapSize,
    }
  }

  return { lines, dropCap }
}
