// Client-side member identity stored in localStorage

export interface MemberIdentity {
  memberId: string
  displayName: string
  teamId: string
  joinCode: string
}

const KEY = 'arbor_member'

export function saveMember(identity: MemberIdentity) {
  localStorage.setItem(KEY, JSON.stringify(identity))
}

export function loadMember(): MemberIdentity | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearMember() {
  localStorage.removeItem(KEY)
}
