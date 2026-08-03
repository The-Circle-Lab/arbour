'use client'

import { useState, SubmitEvent } from 'react'
import { Modal } from '@/components/Modal'
import { STATUS_LABELS, type TaskStatus } from '@/lib/task-status'

interface AdminTask {
  id: string
  title: string
  status: TaskStatus
  deadline: string | null
}

interface AdminTeam {
  id: string
  name: string
  join_code: string
  tasks: AdminTask[]
}

type Screen = 'password' | 'menu'
type ActiveModal = 'scenario3' | 'scenario5' | null

interface Scenario3Result {
  taskTitle: string
  deadline: string
  approvals: number
}

interface Scenario5Result {
  checkinsSeeded: number
  plantState: string
  tasksCompleted: number
  tasksLeftInReview: number
  approvals: number
  grade: string
}

export default function AdminPage() {
  const [screen, setScreen] = useState<Screen>('password')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const [teams, setTeams] = useState<AdminTeam[]>([])
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)

  const [scenario3TeamId, setScenario3TeamId] = useState('')
  const [scenario3TaskId, setScenario3TaskId] = useState('')
  const [scenario3Running, setScenario3Running] = useState(false)
  const [scenario3Error, setScenario3Error] = useState('')
  const [scenario3Result, setScenario3Result] = useState<Scenario3Result | null>(null)

  const [scenario5TeamId, setScenario5TeamId] = useState('')
  const [scenario5Grade, setScenario5Grade] = useState('5/8')
  const [scenario5Running, setScenario5Running] = useState(false)
  const [scenario5Error, setScenario5Error] = useState('')
  const [scenario5Result, setScenario5Result] = useState<Scenario5Result | null>(null)

  async function loadTeams() {
    const res = await fetch('/api/admin/teams')
    if (!res.ok) return
    const data = await res.json()
    setTeams(data.teams ?? [])
  }

  async function handleLogin(e: SubmitEvent) {
    e.preventDefault()
    setLoggingIn(true)
    setLoginError('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      await loadTeams()
      setScreen('menu')
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoggingIn(false)
    }
  }

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    setPassword('')
    setTeams([])
    setScreen('password')
  }

  function closeScenario3() {
    setActiveModal(null)
    setScenario3TeamId('')
    setScenario3TaskId('')
    setScenario3Error('')
    setScenario3Result(null)
  }

  function closeScenario5() {
    setActiveModal(null)
    setScenario5TeamId('')
    setScenario5Grade('5/8')
    setScenario5Error('')
    setScenario5Result(null)
  }

  async function runScenario3() {
    setScenario3Running(true)
    setScenario3Error('')
    try {
      const res = await fetch('/api/admin/scenario-3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: scenario3TeamId, taskId: scenario3TaskId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      setScenario3Result(data)
      await loadTeams()
    } catch (e) {
      setScenario3Error(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setScenario3Running(false)
    }
  }

  async function runScenario5() {
    setScenario5Running(true)
    setScenario5Error('')
    try {
      const res = await fetch('/api/admin/scenario-5', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: scenario5TeamId, grade: scenario5Grade }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      setScenario5Result(data)
      await loadTeams()
    } catch (e) {
      setScenario5Error(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setScenario5Running(false)
    }
  }

  const scenario3Team = teams.find(t => t.id === scenario3TeamId)

  if (screen === 'password') {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-stone-800 mb-1">Admin</h1>
            <p className="text-stone-500 text-sm">Demo scenario controls</p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <input
              type="password"
              className="border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-green-600"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
            {loginError && <p className="text-red-500 text-sm">{loginError}</p>}
            <button
              type="submit"
              disabled={loggingIn || !password}
              className="w-full bg-green-700 text-white rounded-xl py-3 text-base font-medium hover:bg-green-800 disabled:opacity-50 transition"
            >
              {loggingIn ? 'Checking…' : 'Enter'}
            </button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-stone-50 p-4 md:p-8">
      <div className="max-w-md mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-stone-800 mb-1">Admin</h1>
          <p className="text-stone-500 text-sm">Fast-forward a team&apos;s state for a demo</p>
        </div>

        <div className="flex flex-col gap-4">
          <button
            onClick={() => setActiveModal('scenario3')}
            className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6 text-left hover:border-green-200 transition"
          >
            <p className="text-lg font-bold text-stone-800">Scenario 3</p>
            <p className="text-sm text-stone-500 mt-1">Arm a task&apos;s deadline to fire in 2 minutes, to demo the missed-deadline flow.</p>
          </button>

          <button
            onClick={() => setActiveModal('scenario5')}
            className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6 text-left hover:border-green-200 transition"
          >
            <p className="text-lg font-bold text-stone-800">Scenario 5</p>
            <p className="text-sm text-stone-500 mt-1">Jump a team to DONE with a clean check-in #2 and a grade, to demo the final report.</p>
          </button>
        </div>

        <button onClick={handleLogout} className="w-full text-center text-sm text-stone-400 hover:text-stone-600 mt-8">
          Log out
        </button>
      </div>

      <Modal open={activeModal === 'scenario3'} labelledBy="scenario3-heading" onClose={closeScenario3}>
        <div className="p-6">
          <h2 id="scenario3-heading" className="text-lg font-bold text-stone-800 mb-4">Scenario 3 — Missed deadline</h2>

          <label className="block text-sm font-medium text-stone-700 mb-1">Team</label>
          <select
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 mb-4 focus:outline-none focus:ring-2 focus:ring-green-600"
            value={scenario3TeamId}
            onChange={e => { setScenario3TeamId(e.target.value); setScenario3TaskId(''); setScenario3Result(null); setScenario3Error('') }}
          >
            <option value="">Select a team…</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{`${t.name} (${t.join_code})`}</option>
            ))}
          </select>

          <label className="block text-sm font-medium text-stone-700 mb-1">Task</label>
          <select
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 mb-4 focus:outline-none focus:ring-2 focus:ring-green-600 disabled:opacity-50"
            value={scenario3TaskId}
            onChange={e => { setScenario3TaskId(e.target.value); setScenario3Result(null); setScenario3Error('') }}
            disabled={!scenario3Team}
          >
            <option value="">Select a task…</option>
            {(scenario3Team?.tasks ?? []).map(task => (
              <option key={task.id} value={task.id}>
                {`${task.title} — ${STATUS_LABELS[task.status]}${task.deadline ? ` — due ${new Date(task.deadline).toLocaleString()}` : ' — no deadline'}`}
              </option>
            ))}
          </select>

          {scenario3Error && <p className="text-red-500 text-sm mb-4">{scenario3Error}</p>}

          {scenario3Result && (
            <div className="bg-green-50 text-green-900 rounded-xl p-4 mb-4 text-sm">
              <p className="font-semibold mb-1">Done</p>
              <p>&ldquo;{scenario3Result.taskTitle}&rdquo; now deadlines at {new Date(scenario3Result.deadline).toLocaleString()}.</p>
              <p className="mt-1">{`${scenario3Result.approvals} member approval(s) on record.`}</p>
            </div>
          )}

          <button
            onClick={runScenario3}
            disabled={!scenario3TeamId || !scenario3TaskId || scenario3Running}
            className="w-full bg-green-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-green-800 disabled:opacity-40 transition"
          >
            {scenario3Running ? 'Setting deadline…' : 'Set deadline to 2 minutes from now'}
          </button>
        </div>
      </Modal>

      <Modal open={activeModal === 'scenario5'} labelledBy="scenario5-heading" onClose={closeScenario5}>
        <div className="p-6">
          <h2 id="scenario5-heading" className="text-lg font-bold text-stone-800 mb-4">Scenario 5 — Final report</h2>

          <label className="block text-sm font-medium text-stone-700 mb-1">Team</label>
          <select
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 mb-4 focus:outline-none focus:ring-2 focus:ring-green-600"
            value={scenario5TeamId}
            onChange={e => { setScenario5TeamId(e.target.value); setScenario5Result(null); setScenario5Error('') }}
          >
            <option value="">Select a team…</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{`${t.name} (${t.join_code})`}</option>
            ))}
          </select>

          <label className="block text-sm font-medium text-stone-700 mb-1">Grade</label>
          <input
            type="text"
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 mb-4 focus:outline-none focus:ring-2 focus:ring-green-600"
            value={scenario5Grade}
            onChange={e => setScenario5Grade(e.target.value)}
          />

          <div className="bg-stone-50 rounded-xl p-4 mb-4 text-xs text-stone-500 leading-relaxed">
            This will: seed a fully-aligned check-in #2 for every member, cache a healthy plant state for cycle 2,
            mark all to-do / in-progress tasks done (submitted tasks stay in review), record everyone&apos;s task-list
            approval, and set the team&apos;s grade — moving the team straight to the DONE phase.
          </div>

          {scenario5Error && <p className="text-red-500 text-sm mb-4">{scenario5Error}</p>}

          {scenario5Result && (
            <div className="bg-green-50 text-green-900 rounded-xl p-4 mb-4 text-sm">
              <p className="font-semibold mb-1">Done</p>
              <p>{`${scenario5Result.checkinsSeeded} check-in responses seeded · plant is ${scenario5Result.plantState}.`}</p>
              <p className="mt-1">{`${scenario5Result.tasksCompleted} task(s) marked done · ${scenario5Result.tasksLeftInReview} left in review.`}</p>
              <p className="mt-1">Grade set to {scenario5Result.grade}.</p>
            </div>
          )}

          <button
            onClick={runScenario5}
            disabled={!scenario5TeamId || !scenario5Grade.trim() || scenario5Running}
            className="w-full bg-green-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-green-800 disabled:opacity-40 transition"
          >
            {scenario5Running ? 'Completing…' : 'Complete team & grade'}
          </button>
        </div>
      </Modal>
    </main>
  )
}
