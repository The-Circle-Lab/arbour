import { Pool } from 'pg'
import { getDatabaseUrl } from './database-url.ts'

let _pool: Pool | null = null

const isProduction = process.env.NODE_ENV === 'production'

function getPool(): Pool {
  if (!_pool) {
    const connectionString = getDatabaseUrl()
    _pool = new Pool({
      connectionString,
      ssl: isProduction ? { rejectUnauthorized: false } : false,
    })
  }
  return _pool
}

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const res = await getPool().query(text, params)
  return res.rows as T[]
}

export async function queryOne<T = unknown>(text: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}
