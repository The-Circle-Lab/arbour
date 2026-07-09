import fs from 'fs'
import path from 'path'

type Secrets = {
  user?: string
  password?: string
  host?: string
  port?: number
  database?: string
}

export function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL

  const secretsPath = path.resolve(process.cwd(), 'secrets.json')
  if (fs.existsSync(secretsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(secretsPath, 'utf8')) as Secrets
      const user = parsed.user ?? 'postgres'
      const password = parsed.password ? encodeURIComponent(parsed.password) : ''
      const host = parsed.host ?? 'localhost'
      const port = parsed.port ?? 5432
      const database = parsed.database ?? 'arbor'
      const auth = password ? `${user}:${password}@` : `${user}@`
      return `postgres://${auth}${host}:${port}/${database}`
    } catch {
      // fall through to error below
    }
  }

  throw new Error('Please create secrets.json in the repo root with DB credentials')
}