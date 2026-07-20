export type ApiResult = { ok: true } | { ok: false; error: string }

// Shared client-side fetch wrapper — every mutating request goes through here
// so a rejected request (stale data, validation failure, a race with another
// member's edit) surfaces the server's error message the same way everywhere
// instead of each call site re-parsing the error body itself.
export async function apiRequest(url: string, opts: RequestInit): Promise<ApiResult> {
  const res = await fetch(url, opts)
  if (res.ok) return { ok: true }
  const body = await res.json().catch(() => null)
  return { ok: false, error: body?.error ?? 'Something went wrong. Please try again.' }
}
