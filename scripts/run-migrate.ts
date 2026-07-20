import { spawnSync } from 'child_process'
import { getDatabaseUrl } from '../src/lib/database-url.ts'

const cmd = process.argv[2] ?? 'up'
let dbUrl: string
try {
  dbUrl = getDatabaseUrl()
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Unable to resolve database URL')
  process.exit(2)
}
// Log connection info without revealing the password
try {
  const parsed = new URL(dbUrl)
  const dbHost = parsed.hostname
  const dbPort = parsed.port || '5432'
  const dbName = parsed.pathname ? parsed.pathname.replace(/^\//, '') : ''
  const dbUser = parsed.username || ''
  console.log(`Using database host=${dbHost} port=${dbPort} database=${dbName} user=${dbUser}`)
} catch {
  // ignore parse errors
}

const args = ['node-pg-migrate', cmd, '-m', 'migrations', '-j', 'ts', '--ts-node']
const env = { ...process.env, DATABASE_URL: dbUrl }
const res = spawnSync('npx', args, { stdio: 'inherit', env, shell: process.platform === 'win32' })
if (res.error) {
  console.error(`Failed to launch migration command: ${res.error.message}`)
  process.exit(1)
}

if (res.signal) {
  console.error(`Migration command terminated by signal ${res.signal}`)
  process.exit(1)
}

process.exit(res.status ?? 1)
