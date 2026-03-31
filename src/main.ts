import { PARAGRAPHS } from './content.ts'
import { prepareText, layoutColumns, type ColumnConfig } from './text-layout.ts'
import {
  createBlackHole, updateBlackHoles, getHoleAtPoint, getHoleNearPoint,
  type BlackHole,
} from './black-hole.ts'
import { drawTextLines, drawDropCap } from './text-renderer.ts'
import {
  createStars, drawStars, drawBackground,
  spawnParticles, updateParticles, drawParticles,
  spawnMergeBurst,
  drawBlackHoles,
  addShockwave, updateShockwaves, drawShockwaves,
  createScreenShake, triggerShake, updateShake,
  type Star, type Particle, type ScreenShake,
} from './effects.ts'

// ── Canvas ──

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const onboarding = document.getElementById('onboarding')!
const flash = document.getElementById('flash')!
const controlsEl = document.getElementById('controls')!
const statsEl = document.getElementById('stats')!
const pausedBadge = document.getElementById('paused-badge')!
const body = document.body

let W = 0, H = 0, dpr = 1

function resize() {
  dpr = window.devicePixelRatio || 1
  W = window.innerWidth
  H = window.innerHeight
  canvas.width = W * dpr
  canvas.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  stars = createStars(Math.floor(W * H / 5000), W, H)
  bgDirty = true
  // Re-prepare text at new screen width for responsive font sizing
  prepareText(PARAGRAPHS, W)
}

// ── State ──

let blackHoles: BlackHole[] = []
let stars: Star[] = []
let particles: Particle[] = []
let bgDirty = true
let bgCanvas: OffscreenCanvas | null = null
let time = 0
let lastFrame = 0
let onboardingVisible = true
let paused = false
let totalMerges = 0
const shake: ScreenShake = createScreenShake()

// ── Cursor ──

type CursorMode = 'default' | 'grab' | 'grabbing'
let currentCursor: CursorMode = 'default'

function setCursor(mode: CursorMode) {
  if (mode === currentCursor) return
  body.classList.remove('cursor-grab', 'cursor-grabbing')
  if (mode !== 'default') body.classList.add(`cursor-${mode}`)
  currentCursor = mode
}

// ── Interaction ──

let pointerX = 0, pointerY = 0

type DragState =
  | { type: 'none' }
  | { type: 'pending'; startX: number; startY: number; startTime: number; hole: BlackHole | null }
  | { type: 'moving-hole'; hole: BlackHole; offsetX: number; offsetY: number; lastX: number; lastY: number; lastTime: number }
  | { type: 'fling-new'; startX: number; startY: number; startTime: number }

let drag: DragState = { type: 'none' }

canvas.addEventListener('pointerdown', (e) => {
  pointerX = e.clientX; pointerY = e.clientY
  const hole = getHoleAtPoint(blackHoles, e.clientX, e.clientY)
  drag = { type: 'pending', startX: e.clientX, startY: e.clientY, startTime: performance.now(), hole }
  if (hole) setCursor('grabbing')
})

canvas.addEventListener('pointermove', (e) => {
  pointerX = e.clientX; pointerY = e.clientY

  if (drag.type === 'pending') {
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY
    if (dx * dx + dy * dy > 36) {
      if (drag.hole) {
        drag.hole.vx = 0; drag.hole.vy = 0
        drag = {
          type: 'moving-hole', hole: drag.hole,
          offsetX: drag.hole.x - drag.startX, offsetY: drag.hole.y - drag.startY,
          lastX: e.clientX, lastY: e.clientY, lastTime: performance.now(),
        }
        setCursor('grabbing')
      } else {
        drag = { type: 'fling-new', startX: drag.startX, startY: drag.startY, startTime: drag.startTime }
      }
    }
  }

  if (drag.type === 'moving-hole') {
    drag.hole.x = e.clientX + drag.offsetX
    drag.hole.y = e.clientY + drag.offsetY
    drag.hole.vx = 0; drag.hole.vy = 0
    drag.lastX = e.clientX; drag.lastY = e.clientY
    drag.lastTime = performance.now()
  }

  if (drag.type === 'none') {
    setCursor(getHoleAtPoint(blackHoles, e.clientX, e.clientY) ? 'grab' : 'default')
  }
})

canvas.addEventListener('pointerup', (e) => {
  const x = e.clientX, y = e.clientY

  if (drag.type === 'pending') {
    if (drag.hole) {
      drag.hole.alive = false
      addShockwave(drag.hole.x, drag.hole.y, drag.hole.mass * 0.3)
    } else {
      spawnNewHole(x, y)
    }
  } else if (drag.type === 'fling-new') {
    const dt = Math.max((performance.now() - drag.startTime) / 1000, 0.016)
    const vx = (x - drag.startX) / dt * 0.08
    const vy = (y - drag.startY) / dt * 0.08
    blackHoles.push(createBlackHole(drag.startX, drag.startY, vx, vy))
    dismissOnboarding()
  } else if (drag.type === 'moving-hole') {
    const dt = Math.max((performance.now() - drag.lastTime) / 1000, 0.016)
    if (dt < 0.15) {
      drag.hole.vx = (x - drag.lastX) / dt * 0.06
      drag.hole.vy = (y - drag.lastY) / dt * 0.06
    }
  }

  drag = { type: 'none' }
  setCursor(getHoleAtPoint(blackHoles, x, y) ? 'grab' : 'default')
})

function spawnNewHole(x: number, y: number) {
  let vx = 0, vy = 0
  const alive = blackHoles.filter(h => h.alive)
  if (alive.length > 0) {
    let nearest: BlackHole | null = null, nd = Infinity
    for (const h of alive) {
      const d = Math.sqrt((h.x - x) ** 2 + (h.y - y) ** 2)
      if (d < nd) { nearest = h; nd = d }
    }
    if (nearest && nd < 400) {
      const dx = x - nearest.x, dy = y - nearest.y
      const speed = 30 / Math.sqrt(nd)
      vx = -dy / nd * speed
      vy = dx / nd * speed
    }
  }
  blackHoles.push(createBlackHole(x, y, vx, vy))
  dismissOnboarding()
}

function dismissOnboarding() {
  if (onboardingVisible) {
    onboarding.classList.add('hidden')
    controlsEl.classList.add('visible')
    onboardingVisible = false
  }
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault()
  const near = getHoleNearPoint(blackHoles, e.clientX, e.clientY)
  if (near) {
    const delta = e.deltaY > 0 ? -0.08 : 0.08
    near.mass = Math.max(0.3, Math.min(5, near.mass + delta))
    near.eventHorizon = 28 * Math.sqrt(near.mass)
    near.exclusionRadius = near.eventHorizon * 2.8
    near.influenceRadius = near.eventHorizon * 7
  }
}, { passive: false })

canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false })

window.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault()
    paused = !paused
    pausedBadge.classList.toggle('visible', paused)
  }
  if (e.key === 'r' || e.key === 'R') {
    blackHoles = []; particles = []; totalMerges = 0
    statsEl.classList.remove('visible')
    if (!onboardingVisible) {
      onboarding.classList.remove('hidden')
      controlsEl.classList.remove('visible')
      onboardingVisible = true
    }
  }
})

window.addEventListener('resize', resize)

// ── Two-column book spread ──

function getColumns(): ColumnConfig[] {
  // Mobile: single centered column
  if (W < 600) {
    const maxCol = 500
    const margin = 24
    const colWidth = Math.min(W - margin * 2, maxCol)
    const x = (W - colWidth) / 2  // always centered
    const top = 44   // clear of onboarding text
    const bottom = 52
    return [{ x, width: colWidth, startY: top, endY: H - bottom }]
  }

  // Tablet: single centered column
  if (W < 900) {
    const maxCol = 560
    const margin = 40
    const colWidth = Math.min(W - margin * 2, maxCol)
    const x = (W - colWidth) / 2
    const top = 48
    const bottom = 56
    return [{ x, width: colWidth, startY: top, endY: H - bottom }]
  }

  // Desktop: two-column book spread
  const topMargin = 56
  const bottomMargin = 60
  const outerMargin = 72
  const gutter = 52
  const maxSpread = 1200
  const availableWidth = Math.min(W - outerMargin * 2, maxSpread)
  const spreadX = (W - availableWidth) / 2
  const colWidth = (availableWidth - gutter) / 2

  return [
    { x: spreadX, width: colWidth, startY: topMargin, endY: H - bottomMargin },
    { x: spreadX + colWidth + gutter, width: colWidth, startY: topMargin, endY: H - bottomMargin },
  ]
}

// ── Background ──

function renderBackground() {
  if (!bgCanvas || bgCanvas.width !== canvas.width || bgCanvas.height !== canvas.height) {
    bgCanvas = new OffscreenCanvas(canvas.width, canvas.height)
  }
  const bgCtx = bgCanvas.getContext('2d')!
  bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawBackground(bgCtx, W, H)
  bgDirty = false
}

// ── Merge flash ──

function triggerFlash(x: number, y: number, mass: number) {
  const intensity = Math.min(0.18, 0.06 + mass * 0.025)
  flash.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255,190,130,${intensity}), transparent 50%)`
  flash.classList.add('active')
  setTimeout(() => flash.classList.remove('active'), 50)
}

// ── Stats ──

let statsTimer = 0
function updateStats() {
  const now = performance.now()
  if (now - statsTimer < 500) return
  statsTimer = now
  const alive = blackHoles.filter(h => h.alive).length
  if (alive === 0 && totalMerges === 0) { statsEl.classList.remove('visible'); return }
  statsEl.classList.add('visible')
  const totalMass = blackHoles.reduce((s, h) => h.alive ? s + h.mass : s, 0)
  const parts = [`${alive} singularit${alive === 1 ? 'y' : 'ies'}`, `${totalMass.toFixed(1)}M`]
  if (totalMerges > 0) parts.push(`${totalMerges} merge${totalMerges === 1 ? '' : 's'}`)
  statsEl.textContent = parts.join('  ·  ')
}

// ── Gutter line ──

function drawGutterLine(columns: ColumnConfig[]) {
  if (columns.length < 2) return
  const col1 = columns[0]!, col2 = columns[1]!
  const gutterX = (col1.x + col1.width + col2.x) / 2
  const top = Math.min(col1.startY, col2.startY)
  const bottom = Math.max(col1.endY, col2.endY)

  ctx.strokeStyle = 'rgba(196, 184, 168, 0.04)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(gutterX, top + 10)
  ctx.lineTo(gutterX, bottom - 10)
  ctx.stroke()
}

// ── Main loop ──

function frame(now: number) {
  const rawDt = (now - lastFrame) / 1000
  lastFrame = now
  const dt = paused ? 0 : Math.min(rawDt, 0.05)
  time += dt

  blackHoles = blackHoles.filter(h => h.alive)

  if (!paused) {
    const merges = updateBlackHoles(blackHoles, dt, W, H)

    for (const ev of merges) {
      totalMerges++
      addShockwave(ev.x, ev.y, ev.mass)
      triggerShake(shake, 2 + ev.mass * 1.5)
      triggerFlash(ev.x, ev.y, ev.mass)
      const idx = blackHoles.findIndex(h => h.alive && Math.abs(h.x - ev.x) < 5 && Math.abs(h.y - ev.y) < 5)
      if (idx >= 0) spawnMergeBurst(particles, ev, idx)
    }

    particles = spawnParticles(blackHoles, particles)
    updateParticles(particles, blackHoles, dt)
    updateShockwaves(dt)
    updateShake(shake)
  }

  const columns = getColumns()
  const { lines, dropCap } = layoutColumns(blackHoles, columns)

  // Render
  if (bgDirty) renderBackground()

  ctx.save()
  if (shake.intensity > 0) ctx.translate(shake.offsetX, shake.offsetY)

  if (bgCanvas) {
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, shake.offsetX * dpr, shake.offsetY * dpr)
    ctx.drawImage(bgCanvas, 0, 0)
    ctx.restore()
    ctx.setTransform(dpr, 0, 0, dpr, shake.offsetX, shake.offsetY)
  }

  drawStars(ctx, stars, blackHoles)

  // Gutter line between columns
  drawGutterLine(columns)

  // Drop cap
  drawDropCap(ctx, dropCap, blackHoles)

  // Text
  drawTextLines(ctx, lines, blackHoles, time)

  drawShockwaves(ctx)
  drawParticles(ctx, particles)
  drawBlackHoles(ctx, blackHoles, time)

  // Fling preview
  if (drag.type === 'fling-new') {
    const dx = pointerX - drag.startX, dy = pointerY - drag.startY
    if (dx * dx + dy * dy > 25) {
      ctx.strokeStyle = 'rgba(196,184,168,0.08)'
      ctx.lineWidth = 0.8
      ctx.setLineDash([3, 5])
      ctx.beginPath()
      ctx.moveTo(drag.startX, drag.startY)
      ctx.lineTo(pointerX, pointerY)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  ctx.restore()
  updateStats()
  requestAnimationFrame(frame)
}

// ── Init ──

async function init() {
  await document.fonts.ready
  resize()
  prepareText(PARAGRAPHS, W)
  lastFrame = performance.now()
  requestAnimationFrame(frame)
}

init()
