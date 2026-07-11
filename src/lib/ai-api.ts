import Anthropic from '@anthropic-ai/sdk'

export const supportedModels = {
  'fast_model': 'claude-haiku-4-5-20251001',
  'default_model': 'claude-sonnet-4-6'
} as const

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 4 })

export async function sendAiApiRequest<T>(
  model: keyof typeof supportedModels,
  max_tokens: number,
  prompt: string,
  schema: Record<string, unknown>
): Promise<T> {
  const response = await client.messages.create({
    model: supportedModels[model],
    max_tokens,
    messages: [{ role: 'user', content: prompt }],
    output_config: { format: { type: 'json_schema', schema } },
  })

  if (response.stop_reason === 'refusal') {
    throw new Error('AI request was refused.')
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('AI response was truncated before completing (max_tokens reached).')
  }

  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!text) {
    throw new Error(`AI response contained no text (stop_reason: ${response.stop_reason}).`)
  }

  return JSON.parse(text.text) as T
}
