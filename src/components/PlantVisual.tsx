'use client'

type PlantState = 'thriving' | 'healthy' | 'struggling' | 'wilting'

interface PlantVisualProps {
  state: PlantState
  onClick?: () => void
  size?: number
}

const STATE_COLORS: Record<PlantState, { trunk: string; leaves: string; soil: string; label: string }> = {
  thriving: { trunk: '#7B4F2E', leaves: '#22C55E', soil: '#92400E', label: 'Thriving' },
  healthy: { trunk: '#7B4F2E', leaves: '#86EFAC', soil: '#92400E', label: 'Healthy' },
  struggling: { trunk: '#92400E', leaves: '#EAB308', soil: '#78350F', label: 'Struggling' },
  wilting: { trunk: '#A16207', leaves: '#EF4444', soil: '#78350F', label: 'Wilting' },
}

export function PlantVisual({ state, onClick, size = 180 }: PlantVisualProps) {
  const c = STATE_COLORS[state]
  const isWilting = state === 'wilting'
  const isStruggling = state === 'struggling'

  return (
    <div
      className={`flex flex-col items-center gap-2 ${onClick ? 'cursor-pointer select-none' : ''}`}
      onClick={onClick}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        style={{ transition: 'all 0.5s ease' }}
      >
        {/* Soil */}
        <ellipse cx="50" cy="88" rx="30" ry="8" fill={c.soil} opacity="0.7" />

        {/* Trunk */}
        <rect
          x="46"
          y={isWilting ? 60 : isStruggling ? 55 : 50}
          width="8"
          height={isWilting ? 28 : isStruggling ? 33 : 38}
          rx="4"
          fill={c.trunk}
        />

        {/* Leaves — thriving: full canopy */}
        {state === 'thriving' && (
          <>
            <circle cx="50" cy="42" r="22" fill={c.leaves} />
            <circle cx="34" cy="50" r="14" fill={c.leaves} />
            <circle cx="66" cy="50" r="14" fill={c.leaves} />
          </>
        )}

        {/* Leaves — healthy */}
        {state === 'healthy' && (
          <>
            <circle cx="50" cy="44" r="18" fill={c.leaves} />
            <circle cx="36" cy="52" r="11" fill={c.leaves} />
            <circle cx="64" cy="52" r="11" fill={c.leaves} />
          </>
        )}

        {/* Leaves — struggling: sparse */}
        {state === 'struggling' && (
          <>
            <circle cx="50" cy="48" r="14" fill={c.leaves} opacity="0.8" />
            <circle cx="38" cy="54" r="8" fill={c.leaves} opacity="0.7" />
            <circle cx="62" cy="56" r="7" fill={c.leaves} opacity="0.6" />
          </>
        )}

        {/* Leaves — wilting: drooping, small */}
        {state === 'wilting' && (
          <>
            <ellipse cx="44" cy="63" rx="10" ry="6" fill={c.leaves} opacity="0.7" transform="rotate(-20 44 63)" />
            <ellipse cx="56" cy="65" rx="9" ry="5" fill={c.leaves} opacity="0.6" transform="rotate(15 56 65)" />
            <circle cx="50" cy="58" r="8" fill={c.leaves} opacity="0.5" />
          </>
        )}
      </svg>

      <span className="text-sm font-medium" style={{ color: c.leaves }}>
        {c.label}
      </span>

      {onClick && (
        <span className="text-xs text-gray-400">Tap to see details</span>
      )}
    </div>
  )
}
