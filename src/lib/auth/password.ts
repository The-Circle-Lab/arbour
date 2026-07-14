import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10

// Fixed hash with no real password, for constant-time login on unknown emails.
export const DUMMY_HASH = '$2b$10$5VxaawtLxIomLmT32Zr6KOJ9YrV4MKdBpLaYnGPd0IxdMIN4ysHR2'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
