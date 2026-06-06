import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/usePlayer'
import { flockCreateGame } from '@flock/service'
import { joinGame } from '@shared/gameService'

export default function Home() {
  const { loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState(() => localStorage.getItem('playerName') ?? '')
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)

  const saveName = (n: string) => {
    setName(n)
    localStorage.setItem('playerName', n)
  }

  const handleCreate = async () => {
    if (!name.trim()) return setError('Enter your name first')
    setError('')
    setCreating(true)
    try {
      const { code } = await flockCreateGame(name.trim())
      navigate(`/flock/${code}`)
    } catch (err: any) {
      setError(err.message ?? 'Failed to create game')
    } finally {
      setCreating(false)
    }
  }

  const handleJoin = async () => {
    if (!name.trim()) return setError('Enter your name first')
    if (!roomCode.trim()) return setError('Enter a room code')
    setError('')
    setJoining(true)
    try {
      const result = await joinGame(roomCode.trim(), name.trim())
      const upperCode = roomCode.trim().toUpperCase()
      // Route based on game type
      const route = result.gameType === 'just-one' ? `/just-one/${upperCode}` : `/flock/${upperCode}`
      navigate(route)
    } catch (err: any) {
      setError(err.message ?? 'Failed to join game')
    } finally {
      setJoining(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface linen-texture">
        <p className="text-lg text-on-surface-variant font-body">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 py-12 bg-surface linen-texture font-body text-on-surface relative overflow-hidden">
      {/* Decorative botanical backgrounds */}
      <div className="absolute -top-10 -left-10 opacity-10 pointer-events-none -rotate-12">
        <img src="/images/botanical-fern.png" alt="" className="w-48 h-48 object-contain" />
      </div>
      <div className="absolute -bottom-10 -right-10 opacity-10 pointer-events-none rotate-45">
        <img src="/images/botanical-wheat.png" alt="" className="w-64 h-64 object-contain" />
      </div>

      <div className="w-full max-w-2xl space-y-6 relative px-0">
        <div className="text-center mb-10">
          <h1 className="font-headline text-5xl font-bold tracking-tight text-on-surface leading-none mb-6">
            FLOCK<br />TOGETHER
          </h1>
          {/* Seed-packet style rooster badge */}
          <div className="relative w-48 h-56 mx-auto bg-tertiary-fixed rounded-t-xl overflow-hidden shadow-sm border-b-4 border-secondary-fixed-dim flex flex-col items-center justify-center p-4">
            <img src="/images/rooster-hero.png" alt="Rooster" className="w-40 h-40 object-contain mb-2" />
            <span className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary opacity-70">Quality Entertainment</span>
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-outline-variant/25 bg-surface-container-lowest/40 p-4 sm:p-5">
          <label className="block font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary ml-1" htmlFor="player-name">
            Your name
          </label>
          <input
            id="player-name"
            type="text"
            placeholder="Enter name..."
            value={name}
            onChange={(e) => saveName(e.target.value)}
            className="w-full bg-surface-container-lowest border-2 border-outline-variant/30 rounded-xl px-4 py-3.5 text-on-surface placeholder:text-outline/50 font-body focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            maxLength={20}
          />
        </div>

        <div className="flex flex-col md:flex-row md:items-stretch gap-4 md:gap-0">
          <section
            aria-labelledby="join-heading"
            className="flex flex-1 flex-col md:min-h-[260px] rounded-2xl border border-outline-variant/25 bg-surface-container-lowest/40 p-4 sm:p-5 shadow-[0_4px_16px_rgba(0,0,0,0.2)]"
          >
            <h2 id="join-heading" className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary ml-1">
              Join a game
            </h2>
            <p className="text-on-surface-variant text-xs font-body leading-snug mt-2 mb-4 pl-1">
              Have a room code from the host? Enter it here.
            </p>
            <label htmlFor="room-code" className="sr-only">
              Room code
            </label>
            <input
              id="room-code"
              type="text"
              placeholder="Room code, e.g. MANGO"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="w-full bg-surface-container-lowest border-2 border-outline-variant/30 rounded-xl px-4 py-3.5 text-on-surface placeholder:text-outline/50 font-body focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all mb-4"
              maxLength={10}
            />
            <button
              type="button"
              onClick={handleJoin}
              disabled={joining}
              className="mt-auto w-full bg-primary text-on-primary h-14 rounded-xl font-headline font-bold text-lg tracking-wide shadow-[0_12px_32px_rgba(0,0,0,0.35)] hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              {joining ? 'Joining…' : 'JOIN GAME'}
            </button>
          </section>

          <div className="flex md:hidden items-center gap-4 py-1 shrink-0">
            <div className="h-px flex-1 bg-outline-variant/40" />
            <span className="font-body text-xs italic text-on-surface-variant">or</span>
            <div className="h-px flex-1 bg-outline-variant/40" />
          </div>

          <div
            className="hidden md:flex flex-col items-center justify-center px-3 shrink-0 w-12 self-stretch"
            aria-hidden="true"
          >
            <div className="flex-1 w-px min-h-[1.5rem] bg-outline-variant/40" />
            <span className="font-body text-xs italic text-on-surface-variant py-2">or</span>
            <div className="flex-1 w-px min-h-[1.5rem] bg-outline-variant/40" />
          </div>

          <section
            aria-labelledby="create-heading"
            className="flex flex-1 flex-col md:min-h-[260px] rounded-2xl border border-outline-variant/25 bg-surface-container-lowest/40 p-4 sm:p-5 shadow-[0_4px_16px_rgba(0,0,0,0.2)]"
          >
            <h2 id="create-heading" className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary ml-1">
              Create a game
            </h2>
            <p className="text-on-surface-variant text-xs font-body leading-snug mt-2 mb-4 flex-1 pl-1">
              Start a new room. You&apos;ll be the host and get a code to share.
            </p>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="mt-auto w-full bg-surface-container-lowest border-2 border-primary text-primary h-14 rounded-xl font-headline font-bold text-lg tracking-wide hover:bg-primary-fixed/15 active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              {creating ? 'Creating…' : 'CREATE GAME'}
            </button>
          </section>
        </div>

        {error && (
          <p className="text-center text-error text-sm font-body">{error}</p>
        )}

        <div className="mt-12 opacity-30 flex items-center justify-center gap-4">
          <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'opsz' 20" }}>local_florist</span>
          <div className="w-12 h-px bg-secondary" />
          <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'opsz' 20" }}>psychiatry</span>
          <div className="w-12 h-px bg-secondary" />
          <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'opsz' 20" }}>local_florist</span>
        </div>
      </div>
    </div>
  )
}
