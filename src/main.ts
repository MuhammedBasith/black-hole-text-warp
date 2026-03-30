import { BODY_TEXT } from './content.ts'
import { prepareText, layoutColumns, type ColumnConfig } from './text-layout.ts'
import {
  createBlackHole, updateBlackHoles, getHoleAtPoint, getHoleNearPoint,
  type BlackHole, type MergeEvent,
} from './black-hole.ts'
import { drawTextLines } from './text-renderer.ts'
import {
  createStars, updateStars, drawStars, drawNebula,
  spawnParticles, updateParticles, drawParticles,
  spawnMergeBurst,
  drawBlackHoles, drawGravitationalWaves,
  addShockwave, updateShockwaves, drawShockwaves,
  createScreenShake, triggerShake, updateShake,
  type Star, type Particle, type ScreenShake,
} from './effects.ts'

// ── Canvas setup ──

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const hint = document.getElementById('hint')!
const flash = document.getElementById('flash')!
const controlsEl = document.getElementById('controls')!
const statsEl = document.getElementById('stats')!
const pausedBadge = document.getElementById('paused-badge')!
const body = document.body

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
  stars = createStars(Math.floor(W * H / 2500), W, H)
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
let paused = false
let totalMerges = 0
const shake: ScreenShake = createScreenShake()

// ── Cursor management ──

type CursorMode = 'default' | 'grab' | 'grabbing' | 'pointer'
let currentCursor: CursorMode = 'default'

function setCursor(mode: CursorMode) {
  if (mode === currentCursor) return
  body.classList.remove('cursor-grab', 'cursor-grabbing', 'cursor-pointer')
  if (mode !== 'default') body.classList.add(`cursor-${mode}`)
  currentCursor = mode
}

// ── Interaction state ──

let pointerX = W / 2
let pointerY = H / 2

type DragState =
  | { type: 'none' }
  | { type: 'pending'; startX: number; startY: number; startTime: number; hole: BlackHole | null }
  | { type: 'moving-hole'; hole: BlackHole; offsetX: number; offsetY: number }
  | { type: 'fling-new'; startX: number; startY: number; startTime: number }

let drag: DragState = { type: 'none' }

canvas.addEventListener('pointerdown', (e) => {
  pointerX = e.clientX
  pointerY = e.clientY

  const hole = getHoleAtPoint(blackHoles, e.clientX, e.clientY)
  drag = {
    type: 'pending',
    startX: e.clientX,
    startY: e.clientY,
    startTime: performance.now(),
    hole,
  }

  if (hole) setCursor('grabbing')
})

canvas.addEventListener('pointermove', (e) => {
  pointerX = e.clientX
  pointerY = e.clientY

  if (drag.type === 'pending') {
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (dx * dx + dy * dy > 36) {
      if (drag.hole) {
        // Start moving existing hole
        drag.hole.vx = 0
        drag.hole.vy = 0
        drag = {
          type: 'moving-hole',
          hole: drag.hole,
          offsetX: drag.hole.x - drag.startX,
          offsetY: drag.hole.y - drag.startY,
        }
        setCursor('grabbing')
      } else {
        // Start fling for new hole
        drag = {
          type: 'fling-new',
          startX: drag.startX,
          startY: drag.startY,
          startTime: drag.startTime,
        }
      }
    }
  }

  if (drag.type === 'moving-hole') {
    drag.hole.x = e.clientX + drag.offsetX
    drag.hole.y = e.clientY + drag.offsetY
    drag.hole.vx = 0
    drag.hole.vy = 0
  }

  // Update cursor when not dragging
  if (drag.type === 'none') {
    const hoverHole = getHoleAtPoint(blackHoles, e.clientX, e.clientY)
    if (hoverHole) {
      setCursor('grab')
    } else {
      setCursor('default')
    }
  }
})

canvas.addEventListener('pointerup', (e) => {
  const x = e.clientX
  const y = e.clientY

  if (drag.type === 'pending') {
    if (drag.hole) {
      // Clicked on hole — remove it with a small burst
      drag.hole.alive = false
      addShockwave(drag.hole.x, drag.hole.y, drag.hole.mass * 0.5)
    } else {
      // Clicked empty space — create new hole
      spawnNewHole(x, y)
    }
  } else if (drag.type === 'fling-new') {
    // Fling — create with velocity
    const dt = Math.max((performance.now() - drag.startTime) / 1000, 0.016)
    const vx = (x - drag.startX) / dt * 0.12
    const vy = (y - drag.startY) / dt * 0.12
    blackHoles.push(createBlackHole(drag.startX, drag.startY, vx, vy))
    hideHint()
  } else if (drag.type === 'moving-hole') {
    // Release moved hole — give it velocity based on recent movement
    // (velocity is already 0 from dragging, it just stays where placed)
  }

  drag = { type: 'none' }

  // Update cursor for new state
  const hoverHole = getHoleAtPoint(blackHoles, x, y)
  setCursor(hoverHole ? 'grab' : 'default')
})

function spawnNewHole(x: number, y: number) {
  let vx = 0, vy = 0

  // Give orbital velocity if near existing holes
  const aliveHoles = blackHoles.filter(h => h.alive)
  if (aliveHoles.length > 0) {
    let nearest: BlackHole | null = null
    let nearestDist = Infinity
    for (const h of aliveHoles) {
      const d = Math.sqrt((h.x - x) ** 2 + (h.y - y) ** 2)
      if (d < nearestDist) { nearest = h; nearestDist = d }
    }
    if (nearest && nearestDist < 400) {
      const dx = x - nearest.x
      const dy = y - nearest.y
      const speed = 50 / Math.sqrt(nearestDist)
      vx = -dy / nearestDist * speed
      vy = dx / nearestDist * speed
    }
  }

  blackHoles.push(createBlackHole(x, y, vx, vy))
  hideHint()
}

function hideHint() {
  if (hintVisible) {
    hint.classList.add('hidden')
    controlsEl.classList.add('visible')
    hintVisible = false
  }
}

// Scroll to adjust mass
canvas.addEventListener('wheel', (e) => {
  e.preventDefault()
  const near = getHoleNearPoint(blackHoles, e.clientX, e.clientY)
  if (near) {
    const delta = e.deltaY > 0 ? -0.12 : 0.12
    near.mass = Math.max(0.3, Math.min(5, near.mass + delta))
    near.eventHorizon = 30 * Math.sqrt(near.mass)
    near.influenceRadius = 180 * Math.sqrt(near.mass)
  }
}, { passive: false })

// Touch support
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false })

// ── Keyboard ──

window.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault()
    paused = !paused
    pausedBadge.classList.toggle('visible', paused)
  }
  if (e.key === 'r' || e.key === 'R') {
    blackHoles = []
    particles = []
    totalMerges = 0
    statsEl.classList.remove('visible')
    if (!hintVisible) {
      hint.classList.remove('hidden')
      controlsEl.classList.remove('visible')
      hintVisible = true
    }
  }
})

window.addEventListener('resize', resize)

// ── Column layout config ──

function getColumns(): ColumnConfig[] {
  const gutter = W < 760 ? 24 : 52
  const colGap = W < 760 ? 24 : 44
  const numCols = W < 600 ? 1 : W < 1000 ? 2 : 3
  const totalGap = gutter * 2 + colGap * (numCols - 1)
  const colWidth = (W - totalGap) / numCols

  const columns: ColumnConfig[] = []
  for (let i = 0; i < numCols; i++) {
    columns.push({
      x: gutter + i * (colWidth + colGap),
      width: colWidth,
      startY: 56,
      endY: H - 40,
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

  bgCtx.fillStyle = '#06060b'
  bgCtx.fillRect(0, 0, W, H)
  drawNebula(bgCtx, W, H)

  bgDirty = false
}

// ── Merge flash ──

let flashTimer = 0
function triggerFlash(x: number, y: number) {
  flash.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255,180,100,0.2), transparent 60%)`
  flash.classList.add('active')
  flashTimer = performance.now()
  setTimeout(() => flash.classList.remove('active'), 80)
}

// ── Stats display ──

let statsUpdateTimer = 0
function updateStats() {
  const now = performance.now()
  if (now - statsUpdateTimer < 500) return
  statsUpdateTimer = now

  const alive = blackHoles.filter(h => h.alive).length
  if (alive === 0 && totalMerges === 0) {
    statsEl.classList.remove('visible')
    return
  }

  statsEl.classList.add('visible')
  const totalMass = blackHoles.reduce((sum, h) => h.alive ? sum + h.mass : sum, 0)
  statsEl.innerHTML = [
    `${alive} singularit${alive === 1 ? 'y' : 'ies'}`,
    `${totalMass.toFixed(1)}M total mass`,
    totalMerges > 0 ? `${totalMerges} merge${totalMerges === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join('<br>')
}

// ── Main loop ──

function frame(now: number) {
  const rawDt = (now - lastFrame) / 1000
  lastFrame = now
  const dt = paused ? 0 : Math.min(rawDt, 0.05)
  time += dt

  // Clean up dead holes
  blackHoles = blackHoles.filter(h => h.alive)

  if (!paused) {
    // Physics
    const mergeEvents = updateBlackHoles(blackHoles, dt, W, H)

    // Handle merge events
    for (const event of mergeEvents) {
      totalMerges++
      addShockwave(event.x, event.y, event.mass)
      triggerShake(shake, 4 + event.mass * 3)
      triggerFlash(event.x, event.y)

      // Spawn burst particles
      const survivorIdx = blackHoles.findIndex(h => h.alive && Math.abs(h.x - event.x) < 5 && Math.abs(h.y - event.y) < 5)
      if (survivorIdx >= 0) {
        spawnMergeBurst(particles, event, survivorIdx)
      }
    }

    // Particles & stars
    particles = spawnParticles(blackHoles, particles)
    updateParticles(particles, blackHoles, dt)
    updateStars(stars, blackHoles, dt)
    updateShockwaves(dt)
    updateShake(shake)
  }

  // Layout text
  const columns = getColumns()
  const lines = layoutColumns(blackHoles, columns)

  // ── Render ──
  if (bgDirty) renderBackground()

  ctx.save()

  // Apply screen shake
  if (shake.intensity > 0) {
    ctx.translate(shake.offsetX, shake.offsetY)
  }

  // Background
  if (bgCanvas) {
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, shake.offsetX * dpr, shake.offsetY * dpr)
    ctx.drawImage(bgCanvas, 0, 0)
    ctx.restore()
    ctx.setTransform(dpr, 0, 0, dpr, shake.offsetX, shake.offsetY)
  }

  // Stars
  drawStars(ctx, stars, blackHoles, time)

  // Gravitational wave ripples
  drawGravitationalWaves(ctx, blackHoles, time)

  // Text
  drawTextLines(ctx, lines, blackHoles, time)

  // Shockwave rings
  drawShockwaves(ctx)

  // Particles (in front of text, behind holes)
  drawParticles(ctx, particles)

  // Black holes on top
  drawBlackHoles(ctx, blackHoles, time)

  // Draw drag preview line when flinging
  if (drag.type === 'fling-new') {
    const dx = pointerX - drag.startX
    const dy = pointerY - drag.startY
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > 5) {
      ctx.strokeStyle = 'rgba(200, 160, 255, 0.2)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 6])
      ctx.beginPath()
      ctx.moveTo(drag.startX, drag.startY)
      ctx.lineTo(pointerX, pointerY)
      ctx.stroke()
      ctx.setLineDash([])

      // Small circle at spawn point
      ctx.strokeStyle = 'rgba(200, 160, 255, 0.15)'
      ctx.beginPath()
      ctx.arc(drag.startX, drag.startY, 30, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  ctx.restore()

  // Update stats
  updateStats()

  requestAnimationFrame(frame)
}

// ── Init ──

async function init() {
  await document.fonts.ready

  resize()
  prepareText(BODY_TEXT)
  lastFrame = performance.now()
  requestAnimationFrame(frame)
}

init()
