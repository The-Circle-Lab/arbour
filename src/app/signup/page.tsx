'use client'

import { useState, SubmitEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArborLogo } from '@/components/ArborLogo'
import { useSession } from '@/lib/session'

export default function SignupPage() {
  const router = useRouter()
  const { refresh } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return setError('Please fill in all fields.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      await refresh()
      router.push('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <ArborLogo size={56} />
          </div>
          <h1 className="text-3xl font-bold text-stone-800 mb-1">Create your account</h1>
          <p className="text-stone-500 text-sm">Get started with Arbor</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            type="password"
            className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
            placeholder="Password (min. 8 characters)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-700 text-white rounded-xl py-4 text-lg font-medium hover:bg-green-800 disabled:opacity-50 transition"
          >
            {loading ? 'Creating account…' : 'Sign up'}
          </button>
        </form>

        <p className="text-center text-sm text-stone-500 mt-6">
          Already have an account?{' '}
          <button onClick={() => router.push('/login')} className="text-green-700 font-medium hover:underline">
            Log in
          </button>
        </p>
      </div>
    </main>
  )
}
