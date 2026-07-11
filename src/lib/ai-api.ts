import Anthropic, { APIError } from '@anthropic-ai/sdk'

export const supportedModels = {
  'fast_model': 'claude-haiku-4-5-20251001',
  'default_model': 'claude-sonnet-4-6'
} as const

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 500

function isRetryable(error: unknown): boolean {
  if (!(error instanceof APIError)) return false
  // Retry on connection issues (no status), rate limits, and server errors.
  // 4xx errors (bad request, auth, not found, ...) won't succeed on replay.
  return error.status === undefined || error.status === 429 || error.status >= 500
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function sendAiApiRequest(
  model: keyof typeof supportedModels,
  max_tokens: number,
  prompt: string,
  attempt = 0
) {
  try {
    const request = await client.messages.create({
      model: supportedModels[model],
      max_tokens,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (request.content[0] as { type: string; text: string }).text
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(text)
    return parsed
  } catch (error) {
    if (isRetryable(error) && attempt < MAX_RETRIES) {
      const backoffMs = BASE_BACKOFF_MS * 2 ** attempt
      console.warn(`AI API request failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${backoffMs}ms:`, error)
      await delay(backoffMs)
      return sendAiApiRequest(model, max_tokens, prompt, attempt + 1)
    }
    console.error('Failed to send AI API request after retries exhausted or non-retryable error.', error)
    throw new Error('Failed to send AI API request.', { cause: error })
  }
}
