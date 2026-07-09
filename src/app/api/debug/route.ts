import { NextResponse } from 'next/server'
import { getDatabaseUrl } from '@/lib/database-url'

export async function GET() {
  let databaseUrlSource = 'secrets.json'
  let databaseUrlPrefix = 'NOT SET'

  try {
    const databaseUrl = getDatabaseUrl()
    databaseUrlPrefix = databaseUrl.slice(0, 30)
    databaseUrlSource = process.env.DATABASE_URL ? 'DATABASE_URL' : 'secrets.json'
  } catch {
    databaseUrlSource = 'NOT SET'
  }

  return NextResponse.json({
    hasDbConfig: databaseUrlSource !== 'NOT SET',
    dbUrlPrefix: databaseUrlPrefix,
    dbUrlSource: databaseUrlSource,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    nodeEnv: process.env.NODE_ENV,
  })
}
