'use client'

// Shares the selected-course state between CourseSwitcher (the course
// switcher, rendered in the global navbar) and the instructor pages that
// need to know which course's teams to fetch — kept in client component
// state (this context), not the URL, per the instructor-dashboard plan's
// judgment call.
import { createContext, useCallback, useContext, useEffect, useState, ReactNode, Dispatch, SetStateAction } from 'react'
import { useSession } from '@/lib/session'

export interface InstructorCourse {
  id: string
  name: string
  join_code: string
  created_at: string
  team_count: number
}

interface InstructorCourseContextValue {
  courses: InstructorCourse[]
  loading: boolean
  selectedCourseId: string | null
  setSelectedCourseId: Dispatch<SetStateAction<string | null>>
  refreshCourses: () => Promise<void>
}

const InstructorCourseContext = createContext<InstructorCourseContextValue | null>(null)

export function InstructorCourseProvider({ children }: { children: ReactNode }) {
  const { user } = useSession()
  const isInstructor = user?.role === 'instructor'
  const [courses, setCourses] = useState<InstructorCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)

  const refreshCourses = useCallback(async () => {
    if (!isInstructor) { setLoading(false); return }
    // A real fetch is about to start: make sure `loading` reflects that even
    // if a previous (not-an-instructor) pass already set it to false, so
    // consumers never see loading=false with a stale, pre-fetch courses list.
    setLoading(true)
    try {
      const res = await fetch('/api/courses')
      if (!res.ok) { return }
      const data: { courses: InstructorCourse[] } = await res.json()
      setCourses(data.courses)
      // Falls back to the first remaining course if the previously-selected one
      // is gone (e.g. just deleted), rather than leaving selectedCourseId
      // pointing at a course that no longer appears in the list.
      setSelectedCourseId(current =>
        current && data.courses.some(c => c.id === current) ? current : (data.courses[0]?.id ?? null)
      )
    } finally {
      setLoading(false)
    }
  }, [isInstructor])

  useEffect(() => {
    refreshCourses()
  }, [refreshCourses])

  return (
    <InstructorCourseContext.Provider
      value={{ courses, loading, selectedCourseId, setSelectedCourseId, refreshCourses }}
    >
      {children}
    </InstructorCourseContext.Provider>
  )
}

export function useInstructorCourses(): InstructorCourseContextValue {
  const ctx = useContext(InstructorCourseContext)
  if (!ctx) throw new Error('useInstructorCourses must be used within InstructorCourseProvider')
  return ctx
}
