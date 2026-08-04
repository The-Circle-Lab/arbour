'use client'

import { RefObject, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface CoachmarkProps {
  targetRef: RefObject<HTMLElement | null>
  open: boolean
  body: string
  cta: string
  step: number
  totalSteps: number
  onNext: () => void
}

const GAP = 12
const WIDTH = 280

export function Coachmark({ targetRef, open, body, cta, step, totalSteps, onNext }: CoachmarkProps) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Tracked every frame rather than on scroll/resize alone: the anchor can
  // mount, unmount, or shift as sibling content (drafts, approvals) appears
  // while the tour is open, and a plain listener would miss those changes.
  useEffect(() => {
    if (!open) return
    let frame: number
    function update() {
      const el = targetRef.current
      setRect(el ? el.getBoundingClientRect() : null)
      frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [open, targetRef])

  // Bring the target into view once per tip, rather than on every tracked
  // frame — a continuous scrollIntoView would fight the user's own scrolling.
  useEffect(() => {
    if (!open) return
    targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [open, targetRef])

  useEffect(() => {
    if (!open) return
    buttonRef.current?.focus()

    // The CTA is the only interactive element while a tip is open — the dimmed
    // backdrop already blocks clicks on the rest of the page, and this pins
    // keyboard focus so Tab can't escape to it either. Scrolling stays free.
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Tab') {
        e.preventDefault()
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  if (!open || !rect || typeof document === 'undefined') return null

  // Prefer sitting beside the target, to its left. Falls back to below it
  // when there isn't enough room on the left (e.g. narrow viewports), so the
  // card never overlaps the element it's pointing at.
  const placedLeft = rect.left - GAP >= WIDTH + 12

  const top = placedLeft
    ? Math.min(Math.max(rect.top + rect.height / 2, 12), window.innerHeight - 12)
    : rect.bottom + GAP
  const left = placedLeft
    ? rect.left - GAP - WIDTH
    : Math.min(Math.max(rect.left, 12), window.innerWidth - WIDTH - 12)
  const bottomArrowLeft = Math.min(Math.max(rect.left + rect.width / 2 - left - 6, 12), WIDTH - 24)

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black/40">
      <div
        role="dialog"
        aria-modal="true"
        className="absolute bg-white border border-stone-200 rounded-xl shadow-lg p-4"
        style={{ top, left, width: WIDTH, transform: placedLeft ? 'translateY(-50%)' : undefined }}
      >
        {placedLeft ? (
          <div
            aria-hidden
            className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white border-t border-r border-stone-200 rotate-45"
          />
        ) : (
          <div
            aria-hidden
            className="absolute -top-1.5 w-3 h-3 bg-white border-l border-t border-stone-200 rotate-45"
            style={{ left: bottomArrowLeft }}
          />
        )}
        <span className="inline-block text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full mb-2">
          {`Tip ${step} of ${totalSteps}`}
        </span>
        <p className="text-sm text-stone-700 leading-snug">{body}</p>
        <button
          ref={buttonRef}
          onClick={onNext}
          className="mt-3 w-full bg-green-700 text-white rounded-lg py-1.5 text-xs font-semibold hover:bg-green-800 transition"
        >
          {cta}
        </button>
      </div>
    </div>,
    document.body
  )
}
