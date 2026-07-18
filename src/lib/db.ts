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

export interface TransactionQuery {
  query: <T = unknown>(text: string, params?: unknown[]) => Promise<T[]>
}

export async function withTransaction<T>(fn: (tx: TransactionQuery) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const tx: TransactionQuery = {
      query: async <R = unknown>(text: string, params?: unknown[]): Promise<R[]> => {
        const res = await client.query(text, params)
        return res.rows as R[]
      },
    }
    const result = await fn(tx)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export const UNIQUE_VIOLATION = '23505'

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === UNIQUE_VIOLATION
}
