const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const LOCAL_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/

const DEADLINE_TIME_ZONE = 'America/Toronto'
const DEFAULT_DEADLINE_TIME = '23:59'

const zoneFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: DEADLINE_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
})

function zoneParts(d: Date): Record<string, string> {
  const parts = Object.fromEntries(zoneFormatter.formatToParts(d).map(p => [p.type, p.value]))
  // Intl can format midnight as hour "24" instead of "00"
  if (parts.hour === '24') parts.hour = '00'
  return parts
}

// Converts a wall-clock instant in DEADLINE_TIME_ZONE to the equivalent UTC
// Date, without a timezone library: format `naiveUtc` (the input clock
// reading, misread as UTC) back out *as* DEADLINE_TIME_ZONE to find that
// zone's offset at this specific instant — which correctly varies across
// EDT/EST — then apply it. Same double-conversion trick date-fns-tz uses
// internally, built on Intl (bundled ICU data, no extra dependency).
function zonedWallClockToUtc(naiveUtc: Date): Date {
  const parts = zoneParts(naiveUtc)
  const asIfLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  const offsetMs = naiveUtc.getTime() - asIfLocal
  return new Date(naiveUtc.getTime() + offsetMs)
}

// Task deadlines are entered via the UI's date + time inputs, always
// interpreted as Eastern time. Accepts either a bare "YYYY-MM-DD" (time
// defaults to 11:59 PM — used when no time has been picked, and by the
// AI-generated suggestions which only ever produce a date) or a full
// "YYYY-MM-DDTHH:mm" local wall-clock string, and returns the UTC instant
// to store.
export function toDeadlineUtc(input: string | null | undefined): string | null {
  if (!input) return null
  const match = LOCAL_DATETIME_RE.exec(input)
  const [dateStr, timeStr] = match
    ? [match[1], match[2]]
    : ISO_DATE_RE.test(input) ? [input, DEFAULT_DEADLINE_TIME] : [null, null]
  if (!dateStr) return null
  const naiveUtc = new Date(`${dateStr}T${timeStr}:00.000Z`)
  if (Number.isNaN(naiveUtc.getTime())) return null
  return zonedWallClockToUtc(naiveUtc).toISOString()
}

// Inverse of toDeadlineUtc: given a stored UTC deadline, returns the Eastern
// wall-clock reading as "YYYY-MM-DDTHH:mm", ready to split and bind to the
// UI's date/time inputs — so the frontend never has to do its own timezone math.
export function formatDeadlineLocal(utcIso: string | null | undefined): string | null {
  if (!utcIso) return null
  const d = new Date(utcIso)
  if (Number.isNaN(d.getTime())) return null
  const parts = zoneParts(d)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
