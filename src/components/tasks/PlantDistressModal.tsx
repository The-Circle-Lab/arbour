'use client'

import { useId } from 'react'
import { Modal } from '@/components/Modal'
import { PlantVisual, type PlantType, type PlantState } from '@/components/PlantVisual'

interface PlantDistressModalProps {
  plantType: PlantType
  state: PlantState
  onSeeReason: () => void
}

// A one-tap interstitial in front of DeadlineMissedModal — the team's actual
// plant wilts the moment any deadline is missed, before anyone sees the
// details, so the consequence lands as something that happened to the
// team's shared plant, not just another form to fill out.
export function PlantDistressModal({ plantType, state, onSeeReason }: PlantDistressModalProps) {
  const headingId = useId()

  return (
    <Modal open labelledBy={headingId}>
      <div className="bg-orange-50 border-b border-orange-100 px-6 pt-5 pb-5 text-center">
        <p className="text-xs text-orange-700 uppercase tracking-wide font-semibold mb-1">Your plant</p>
        <h2 id={headingId} className="text-lg font-bold text-stone-800">
          Oh no, it looks like your plant is not doing too good
        </h2>
      </div>

      <div className="p-6 flex flex-col items-center text-center">
        <PlantVisual state={state} plantType={plantType} size={140} />
        <button
          onClick={onSeeReason}
          className="w-full bg-green-700 text-white rounded-xl py-3 mt-6 font-medium hover:bg-green-800 transition"
        >
          See the reason
        </button>
      </div>
    </Modal>
  )
}
