'use client'

import { useEffect, useRef, ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface ModalProps {
  open: boolean
  // id of the element that names this dialog. Required, so a modal can never
  // reach a screen reader announced as just "dialog" with no context.
  labelledBy: string
  // Omit to make the modal non-dismissible: no backdrop click, no Escape.
  onClose?: () => void
  children: ReactNode
}

export function Modal({ open, labelledBy, onClose, children }: ModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Whether the current press started on the backdrop, checked again on release.
  const pressedBackdrop = useRef(false)

  useEffect(() => {
    if (!open) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    const previousPaddingRight = document.body.style.paddingRight

    container.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    // Padding replaces the width the scrollbar gave up, so locking scroll
    // doesn't shift the page sideways. Zero on overlay-scrollbar platforms.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.paddingRight = previousPaddingRight
      previouslyFocused?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(e: KeyboardEvent) {
      const container = containerRef.current
      if (!container) return

      if (e.key === 'Escape' && onClose) {
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      // Re-queried on every Tab rather than captured once: content reveals
      // inputs and flips disabled state as it's used, so a cached list goes stale.
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) {
        e.preventDefault()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      const escaping = !container.contains(active)

      if (e.shiftKey && (active === first || escaping)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || escaping)) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onMouseDown={e => {
        pressedBackdrop.current = e.target === e.currentTarget
      }}
      onMouseUp={e => {
        // Close only when both the press and release land on the backdrop, so a
        // drag that starts or ends inside the dialog never dismisses it.
        if (pressedBackdrop.current && e.target === e.currentTarget) onClose?.()
        pressedBackdrop.current = false
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-2xl border border-stone-100 shadow-sm"
      >
        {children}
      </div>
    </div>,
    document.body
  )
}
