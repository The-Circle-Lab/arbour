import { CHAT_COMPONENTS, ChatComponent, Rating, RATING_VALUES } from './chat-components'

const FLAG_THRESHOLD = 1.0
const DIVERGENCE_BONUS = 0.5

const STATE_THRESHOLDS = {
  thriving: 0,
  healthy: 2,
  struggling: 4,
} as const

export interface CheckinRow {
  component: ChatComponent
  response_data: {
    ratings?: Record<string, Rating>
    rating?: Rating
    [key: string]: unknown
  }
}

function getWorstRating(data: CheckinRow['response_data']): Rating | null {
  if (data.rating) return data.rating
  if (data.ratings) {
    const vals = Object.values(data.ratings) as Rating[]
    if (vals.includes('very_off')) return 'very_off'
    if (vals.includes('slightly_off')) return 'slightly_off'
    if (vals.length > 0) return 'aligned'
  }
  return null
}

export interface PlantResult {
  state: 'thriving' | 'healthy' | 'struggling' | 'wilting'
  flaggedComponents: ChatComponent[]
  componentScores: Record<ChatComponent, number>
}

export function computePlantState(checkins: CheckinRow[], teamSize: number): PlantResult {
  const componentScores: Record<ChatComponent, number> = {} as Record<ChatComponent, number>

  for (const component of CHAT_COMPONENTS) {
    const memberCheckins = checkins.filter(c => c.component === component)
    const ratings = memberCheckins.map(c => getWorstRating(c.response_data)).filter((r): r is Rating => r !== null)

    if (ratings.length === 0) {
      componentScores[component] = 0
      continue
    }

    const numericVals = ratings.map(r => RATING_VALUES[r])
    const avg = numericVals.reduce((a, b) => a + b, 0) / numericVals.length

    let divergenceBonus = 0
    if (teamSize > 1) {
      for (let i = 0; i < ratings.length; i++) {
        for (let j = i + 1; j < ratings.length; j++) {
          const diff = Math.abs(RATING_VALUES[ratings[i]] - RATING_VALUES[ratings[j]])
          if (diff === 2) {
            divergenceBonus += DIVERGENCE_BONUS / (teamSize - 1)
          }
        }
      }
    }

    componentScores[component] = avg + divergenceBonus
  }

  const flaggedComponents = CHAT_COMPONENTS.filter(component => {
    const score = componentScores[component]
    const memberCheckins = checkins.filter(c => c.component === component)
    const ratings = memberCheckins.map(c => getWorstRating(c.response_data)).filter((r): r is Rating => r !== null)
    const anyVeryOff = ratings.includes('very_off')
    return score >= FLAG_THRESHOLD || anyVeryOff
  })

  const flagCount = flaggedComponents.length
  let state: PlantResult['state']
  if (flagCount <= STATE_THRESHOLDS.thriving) {
    state = 'thriving'
  } else if (flagCount <= STATE_THRESHOLDS.healthy) {
    state = 'healthy'
  } else if (flagCount <= STATE_THRESHOLDS.struggling) {
    state = 'struggling'
  } else {
    state = 'wilting'
  }

  return { state, flaggedComponents, componentScores }
}
