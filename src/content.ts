// We use separate paragraphs so we can insert visual paragraph spacing
export const PARAGRAPHS = [
  `A black hole is a region of spacetime where gravity is so strong that nothing, not even light or other electromagnetic waves, has enough energy to escape it. The theory of general relativity predicts that a sufficiently compact mass can deform spacetime to form a black hole. The boundary of no escape is called the event horizon.`,

  `In many ways, a black hole acts like an ideal black body, as it reflects no light. Quantum field theory in curved spacetime predicts that event horizons emit Hawking radiation, with the same spectrum as a black body of a temperature inversely proportional to its mass. This temperature is of the order of billionths of a kelvin for stellar black holes, making it essentially impossible to observe directly.`,

  `Objects whose gravitational fields are too strong for light to escape were first considered in the eighteenth century by John Michell and Pierre-Simon Laplace. In 1916, Karl Schwarzschild found the first modern solution of general relativity that would characterize a black hole. David Finkelstein, in 1958, first published the interpretation of this solution as a region of space from which nothing can escape.`,

  `The idea of a body so massive that even light could not escape was briefly proposed by the English astronomical pioneer John Michell in a letter published in November 1784. He correctly noted that such supermassive but nonradiating bodies might be detectable through their gravitational effects on nearby visible bodies.`,

  `If a black hole is very small, the radiation effects are expected to become very strong. A black hole with the mass of a car would have a diameter of about ten to the minus twenty-four meters and take a nanosecond to evaporate, during which time it would briefly have a luminosity of more than two hundred times that of the visible universe.`,

  `The observation of gravitational waves from merging black holes has provided direct evidence that black holes exist. The first such observation was made in September 2015 by the LIGO gravitational wave observatory. In April 2019, the Event Horizon Telescope released the first direct image of a black hole at the center of Messier 87.`,

  `Spacetime around a black hole is not simply curved — it is twisted, dragged, and stretched by the immense gravitational field. Objects falling toward the event horizon experience spaghettification, the vertical stretching and horizontal compression by growing tidal forces.`,

  `For supermassive black holes, an observer could cross the event horizon without noticing any immediate change, only realizing later that escape has become impossible. The singularity at the center, where density becomes infinite and spacetime curvature diverges, remains one of the great unsolved mysteries of physics.`,

  `Black holes are among the most extreme objects in the universe, yet they are remarkably simple. The no-hair theorem states that a black hole can be completely characterized by just three externally observable parameters: mass, electric charge, and angular momentum. All other information about the matter that formed the black hole is permanently inaccessible.`,

  `The information paradox, first raised by Stephen Hawking in 1976, asks what happens to information that falls into a black hole. If a black hole evaporates completely through Hawking radiation, and that radiation is perfectly thermal, then the information appears to be destroyed — violating a fundamental principle of quantum mechanics.`,
]

const SERIF = '"Cormorant Garamond", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif'

// Responsive sizing — call with screen width
export function getBodyFont(screenW: number): string {
  const size = screenW < 600 ? 14 : screenW < 900 ? 15 : 15.5
  return `${size}px ${SERIF}`
}

export function getLineHeight(screenW: number): number {
  return screenW < 600 ? 23 : screenW < 900 ? 25 : 26
}

export function getParagraphSpacing(screenW: number): number {
  return screenW < 600 ? 8 : 12
}

export const MIN_SLOT_WIDTH = 50

// Drop cap
export function getDropCapLines(screenW: number): number {
  return screenW < 600 ? 2 : 3
}

export function getDropCapFont(size: number): string {
  return `500 ${Math.round(size)}px ${SERIF}`
}
