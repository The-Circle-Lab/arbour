'use client'

import { useEffect, useState } from 'react'

export type PlantState = 'thriving' | 'doing_okay' | 'wilting' | 'dead'

interface Props {
  state: PlantState
  onClick?: () => void
  size?: number
}

// GBA Harvest Moon pixel art plant — 64×96 viewBox, 4px per pixel
type Rect = [number, number, number, number, string] // x, y, w, h, fill

const C = {
  lD:  '#1A3C08', // leaf dark
  lM:  '#3A6C18', // leaf mid
  lB:  '#5EA030', // leaf bright
  lL:  '#84C848', // leaf light
  lH:  '#A8DC68', // leaf highlight
  fl:  '#F8CC28', // flower yellow
  fo:  '#F47820', // flower orange
  wD:  '#4A4A10', // wilt dark
  wM:  '#787828', // wilt mid
  wL:  '#A8A840', // wilt light
  dD:  '#3A2408', // dead dark
  dM:  '#5A3C18', // dead mid
  dL:  '#887040', // dead light/grey
  sD:  '#3A2008', // stem dark
  sM:  '#6A3C18', // stem mid
  sL:  '#8A5428', // stem light
  soD: '#3A1C08', // soil dark
  soM: '#5A3418', // soil mid
  pD:  '#782818', // pot dark (terracotta)
  pM:  '#A83C28', // pot mid
  pL:  '#CC5838', // pot light
  pH:  '#DC7050', // pot highlight
}

// Shared pot (rows y=56–88): terracotta with highlight
const pot: Rect[] = [
  // Soil
  [12, 52, 40, 4, C.soD],
  [14, 56, 36, 4, C.soM],
  // Pot rim
  [8,  60, 48, 4, C.pM],
  [8,  60, 16, 4, C.pH], // rim highlight left
  // Pot body
  [12, 64, 40, 4, C.pM],
  [12, 68, 40, 4, C.pM],
  [12, 64, 4,  8, C.pH], // body highlight
  // Pot lower body (slightly darker)
  [12, 72, 40, 4, C.pD],
  [14, 72, 4,  4, C.pL], // lower highlight
  // Pot base
  [18, 76, 28, 4, C.pD],
  [20, 76, 6,  4, C.pM], // base highlight
  // Bottom foot
  [22, 80, 20, 4, C.pD],
]

// Stem helper — center at x=28–36, from topY to 52
function makeStem(topY: number): Rect[] {
  const rects: Rect[] = []
  for (let y = topY; y < 52; y += 4) {
    rects.push([28, y, 8, 4, C.sD])
    rects.push([28, y, 4, 4, C.sM])
    rects.push([28, y, 2, 4, C.sL])
  }
  return rects
}

// ── THRIVING ── big lush round bush with flowers
const thrivingRects: Rect[] = [
  // Canopy outline
  [20,  4, 24, 4, C.lD],
  [12,  8,  8, 4, C.lD],
  [44,  8,  8, 4, C.lD],
  [ 8, 12,  4,20, C.lD],
  [52, 12,  4,20, C.lD],
  [12, 32,  8, 4, C.lD],
  [44, 32,  8, 4, C.lD],
  [20, 36, 24, 4, C.lD],
  // Mid green fill
  [20,  8, 24, 4, C.lM],
  [12, 12, 40,20, C.lM],
  [16, 32, 32, 4, C.lM],
  // Bright patches
  [24,  8, 16, 8, C.lB],
  [12, 16, 12, 8, C.lB],
  [40, 12, 12,12, C.lB],
  [20, 28, 16, 4, C.lB],
  [36, 24,  8, 4, C.lB],
  // Light patches
  [28,  8,  8, 4, C.lL],
  [12, 16,  4, 4, C.lL],
  [44, 12,  4, 4, C.lL],
  [24, 28,  8, 4, C.lL],
  // Highlights
  [32,  8,  4, 4, C.lH],
  [16, 20,  4, 4, C.lH],
  [44, 20,  4, 4, C.lH],
  // Flowers (yellow + orange)
  [16, 12,  4, 4, C.fl],
  [44, 28,  4, 4, C.fl],
  [40,  8,  4, 4, C.fo],
  [28, 32,  4, 4, C.fo],
  [12, 24,  4, 4, C.fl],
  // Stem (short)
  ...makeStem(40),
  ...pot,
]

// ── DOING OKAY ── medium plant, 2 clusters
const doingOkayRects: Rect[] = [
  // Main cluster (center-top)
  [20, 8,  24, 4, C.lD],
  [16, 12,  4, 4, C.lD],
  [44, 12,  4, 4, C.lD],
  [12, 16,  4,12, C.lD],
  [48, 16,  4,12, C.lD],
  [16, 28,  4, 4, C.lD],
  [44, 28,  4, 4, C.lD],
  [20, 32, 24, 4, C.lD],
  // Fill
  [20, 12, 24,16, C.lM],
  [16, 16,  4,12, C.lM],
  [44, 16,  4,12, C.lM],
  // Bright
  [24, 12, 12, 8, C.lB],
  [36, 16,  8, 8, C.lB],
  [20, 24,  8, 4, C.lB],
  // Light
  [28, 12,  4, 4, C.lL],
  [40, 16,  4, 4, C.lL],
  // Left side cluster
  [ 8, 20,  8, 8, C.lD],
  [12, 20,  4, 8, C.lM],
  [ 8, 20,  4, 4, C.lB],
  // Right side cluster
  [48, 20,  8, 8, C.lD],
  [48, 20,  4, 8, C.lM],
  [52, 20,  4, 4, C.lB],
  // Stem (medium)
  ...makeStem(36),
  ...pot,
]

// ── WILTING ── droopy olive-green leaves, exposed stem
const wiltingRects: Rect[] = [
  // Small center tuft (top)
  [24, 16, 16, 4, C.wD],
  [24, 20, 16, 4, C.wM],
  [28, 16,  8, 4, C.wL],
  // Left drooping leaf — curves down-left
  [16, 24,  8, 4, C.wD],
  [12, 28,  8, 4, C.wM],
  [ 8, 32,  8, 4, C.wM],
  [ 8, 36,  4, 4, C.wL],
  [12, 36,  4, 4, C.wD],
  [20, 24,  4, 8, C.wM],
  // Right drooping leaf — curves down-right
  [40, 24,  8, 4, C.wD],
  [44, 28,  8, 4, C.wM],
  [48, 32,  8, 4, C.wM],
  [52, 36,  4, 4, C.wL],
  [44, 36,  4, 4, C.wD],
  [40, 24,  4, 8, C.wM],
  // Stem (tall, exposed)
  ...makeStem(24),
  ...pot,
]

// ── DEAD ── bare stick, dried leaves, muted brown
const deadRects: Rect[] = [
  // Dead twig right (top)
  [32, 12,  4, 4, C.dD],
  [36, 16,  4, 4, C.dM],
  [36, 16,  4, 4, C.dL],
  [36, 20,  4, 4, C.dD],
  // Dried leaf right — curled
  [36, 24,  8, 4, C.dD],
  [40, 28,  4, 4, C.dM],
  [36, 28,  4, 4, C.dL],
  // Dead twig left
  [24, 20,  4, 4, C.dD],
  [20, 24,  4, 4, C.dM],
  // Dried leaf left — curled
  [12, 28,  8, 4, C.dD],
  [12, 32,  4, 4, C.dM],
  [16, 32,  4, 4, C.dL],
  // Stem full height
  ...makeStem(16),
  ...pot,
]

const STATE_RECTS: Record<PlantState, Rect[]> = {
  thriving:  thrivingRects,
  doing_okay: doingOkayRects,
  wilting:   wiltingRects,
  dead:      deadRects,
}

export const STATE_LABELS: Record<PlantState, string> = {
  thriving:  'Thriving',
  doing_okay: 'Doing okay',
  wilting:   'Wilting',
  dead:      'Dead',
}

export function PlantVisual({ state, onClick, size = 160 }: Props) {
  const [displayed, setDisplayed] = useState(state)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (state === displayed) return
    setFading(true)
    const t = setTimeout(() => {
      setDisplayed(state)
      setFading(false)
    }, 350)
    return () => clearTimeout(t)
  }, [state, displayed])

  return (
    <div
      className={`flex flex-col items-center gap-2 ${onClick ? 'cursor-pointer select-none' : ''}`}
      onClick={onClick}
    >
      <svg
        viewBox="0 0 64 96"
        width={size}
        height={size * 1.5}
        xmlns="http://www.w3.org/2000/svg"
        style={{
          imageRendering: 'pixelated',
          transition: 'opacity 0.35s ease',
          opacity: fading ? 0 : 1,
        }}
      >
        {STATE_RECTS[displayed].map(([x, y, w, h, fill], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />
        ))}
      </svg>
      <span className="text-sm font-semibold text-stone-600">{STATE_LABELS[displayed]}</span>
    </div>
  )
}
