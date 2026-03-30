import { BODY_TEXT } from './content.ts'
import { prepareText, layoutColumns, type ColumnConfig } from './text-layout.ts'
import { createBlackHole, updateBlackHoles, type BlackHole } from './black-hole.ts'
import { drawTextLines } from './text-renderer.ts'
import {
  createStars, drawStars, drawNebula,
  spawnParticles, updateParticles, drawParticles,
  drawBlackHoles,
  type Star, type Particle,
} from './effects.ts'

// ── Canvas setup ──

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const hint = document.getElementById('hint')!

let W = 0
let H = 0
let dpr = 1

function resize() {
  dpr = window.devicePixelRatio || 1
  W = window.innerWidth
  H = window.innerHeight
  canvas.width = W * dpr
  canvas.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  stars = createStars(Math.floor(W * H / 3000), W, H)
  bgDirty = true
}

// ── State ──

let blackHoles: BlackHole[] = []
let stars: Star[] = []
let particles: Particle[] = []
let bgDirty = true
let bgCanvas: OffscreenCanvas | null = null
let time = 0
let lastFrame = 0
let hintVisible = true

// ── Interaction ──

let dragStart: { x: number; y: number; time: number } | null = null
let isDragging = false

canvas.addEventListener('pointerdown', (e) => {
  dragStart = { x: e.clientX, y: e.clientY, time: performance.now() }
  isDragging = false
})

canvas.addEventListener('pointermove', (e) => {
  if (!dragStart) return
  const dx = e.clientX - dragStart.x
  const dy = e.clientY - dragStart.y
  if (dx * dx + dy * dy > 25) isDragging = true
})

canvas.addEventListener('pointerup', (e) => {
  if (!dragStart) return

  const x = e.clientX
  const y = e.clientY

  if (isDragging) {
    // Fling — velocity from drag
    const dt = Math.max((performance.now() - dragStart.time) / 1000, 0.016)
    const vx = (x - dragStart.x) / dt * 0.15
    const vy = (y - dragStart.y) / dt * 0.15
    blackHoles.push(createBlackHole(dragStart.x, dragStart.y, vx, vy))
  } else {
    // Click — check if we're double-clicking to remove
    const existingIdx = blackHoles.findIndex(h => {
      if (!h.alive) return false
      const dx = h.x - x
      const dy = h.y - y
      return dx * dx + dy * dy < h.eventHorizon * h.eventHorizon
    })

    if (existingIdx >= 0) {
      blackHoles[existingIdx]!.alive = false
    } else {
      // Give a small perpendicular velocity if there are other holes nearby
      let vx = 0, vy = 0
      if (blackHoles.length > 0) {
        const nearest = blackHoles.reduce((best, h) => {
          if (!h.alive) return best
          const d = Math.sqrt((h.x - x) ** 2 + (h.y - y) ** 2)
          return !best || d < best.d ? { h, d } : best
        }, null as { h: BlackHole; d: number } | null)

        if (nearest && nearest.d < 400) {
          // Perpendicular velocity for orbital injection
          const dx = x - nearest.h.x
          const dy = y - nearest.h.y
          const speed = 60 / Math.sqrt(nearest.d)
          vx = -dy / nearest.d * speed
          vy = dx / nearest.d * speed
        }
      }
      blackHoles.push(createBlackHole(x, y, vx, vy))
    }
  }

  // Hide hint after first interaction
  if (hintVisible) {
    hint.classList.add('hidden')
    hintVisible = false
  }

  dragStart = null
  isDragging = false
})

// Scroll to adjust mass
canvas.addEventListener('wheel', (e) => {
  e.preventDefault()
  const x = e.clientX
  const y = e.clientY

  // Find nearest black hole
  let nearest: BlackHole | null = null
  let nearestDist = Infinity
  for (const h of blackHoles) {
    if (!h.alive) continue
    const d = Math.sqrt((h.x - x) ** 2 + (h.y - y) ** 2)
    if (d < nearestDist && d < h.influenceRadius * 1.5) {
      nearest = h
      nearestDist = d
    }
  }

  if (nearest) {
    const delta = e.deltaY > 0 ? -0.15 : 0.15
    nearest.mass = Math.max(0.3, Math.min(5, nearest.mass + delta))
    nearest.eventHorizon = 30 * Math.sqrt(nearest.mass)
    nearest.influenceRadius = 180 * Math.sqrt(nearest.mass)
  }
}, { passive: false })

// Touch support
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false })

window.addEventListener('resize', resize)

// ── Column layout config ──

function getColumns(): ColumnConfig[] {
  const gutter = W < 760 ? 24 : 48
  const colGap = W < 760 ? 24 : 40
  const numCols = W < 600 ? 1 : W < 1000 ? 2 : 3
  const totalGap = gutter * 2 + colGap * (numCols - 1)
  const colWidth = (W - totalGap) / numCols

  const columns: ColumnConfig[] = []
  for (let i = 0; i < numCols; i++) {
    columns.push({
      x: gutter + i * (colWidth + colGap),
      width: colWidth,
      startY: W < 760 ? 50 : 60,
      endY: H - 30,
    })
  }
  return columns
}

// ── Background rendering ──

function renderBackground() {
  if (!bgCanvas || bgCanvas.width !== canvas.width || bgCanvas.height !== canvas.height) {
    bgCanvas = new OffscreenCanvas(canvas.width, canvas.height)
  }
  const bgCtx = bgCanvas.getContext('2d')!
  bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // Deep space background
  bgCtx.fillStyle = '#0a0a0f'
  bgCtx.fillRect(0, 0, W, H)

  // Nebula
  drawNebula(bgCtx, W, H)

  bgDirty = false
}

// ── Main loop ──

function frame(now: number) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05) // cap at 50ms
  lastFrame = now
  time += dt

  // Clean up dead holes
  blackHoles = blackHoles.filter(h => h.alive)

  // Physics
  updateBlackHoles(blackHoles, dt, W, H)
  particles = spawnParticles(blackHoles, particles)
  updateParticles(particles, blackHoles, dt)

  // Layout text
  const columns = getColumns()
  const lines = layoutColumns(blackHoles, columns)

  // Render
  if (bgDirty) renderBackground()
  if (bgCanvas) {
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(bgCanvas, 0, 0)
    ctx.restore()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  // Stars (affected by black holes)
  drawStars(ctx, stars, blackHoles, time)

  // Text
  drawTextLines(ctx, lines, blackHoles, time)

  // Effects on top
  drawParticles(ctx, particles)
  drawBlackHoles(ctx, blackHoles, time)

  requestAnimationFrame(frame)
}

// ── Init ──

async function init() {
  // Wait for font to load
  await document.fonts.ready

  resize()
  prepareText(BODY_TEXT)
  lastFrame = performance.now()
  requestAnimationFrame(frame)
}

init()
