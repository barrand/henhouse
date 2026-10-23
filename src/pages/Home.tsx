import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/usePlayer'
import { flockCreateGame } from '@flock/service'
import { fowlWordsCreateGame } from '@fowl-words/service'
import { truthOrTurdCreateGame } from '@truth-or-turd/service'
import { joinGame } from '@shared/gameService'

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

export default function Home({ experimental = false }: { experimental?: boolean }) {
  const { loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState(() => localStorage.getItem('playerName') ?? '')
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')
  const [creatingFlock, setCreatingFlock] = useState(false)
  const [creatingFowlWords, setCreatingFowlWords] = useState(false)
  const [creatingTruthOrTurd, setCreatingTruthOrTurd] = useState(false)
  const [joining, setJoining] = useState(false)

  const saveName = (n: string) => {
    setName(n)
    localStorage.setItem('playerName', n)
  }

  const handleCreateFlock = async () => {
    if (!name.trim()) return setError('Enter your name first')
    setError('')
    setCreatingFlock(true)
    try {
      const { code } = await flockCreateGame(name.trim(), false, experimental)
      navigate(`/flock/${code}`)
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to create game'))
    } finally {
      setCreatingFlock(false)
    }
  }

  const handleCreateFowlWords = async () => {
    if (!name.trim()) return setError('Enter your name first')
    setError('')
    setCreatingFowlWords(true)
    try {
      const { code } = await fowlWordsCreateGame(name.trim(), false, experimental)
      navigate(`/fowl-words/${code}`)
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to create game'))
    } finally {
      setCreatingFowlWords(false)
    }
  }

  const handleCreateTruthOrTurd = async () => {
    if (!name.trim()) return setError('Enter your name first')
    setError('')
    setCreatingTruthOrTurd(true)
    try {
      const { code } = await truthOrTurdCreateGame(name.trim(), false)
      navigate(`/truth-or-turd/${code}`)
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to create game'))
    } finally {
      setCreatingTruthOrTurd(false)
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
      const route =
        result.gameType === 'fowl-words'
          ? `/fowl-words/${upperCode}`
          : result.gameType === 'truth-or-turd'
          ? `/truth-or-turd/${upperCode}`
          : `/flock/${upperCode}`
      navigate(route)
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to join game'))
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
    <div className="home-shell min-h-screen flex flex-col items-center justify-center bg-surface linen-texture font-body text-on-surface relative overflow-hidden">
      {/* Decorative botanical backgrounds */}
      <div className="absolute -top-10 -left-10 opacity-20 pointer-events-none -rotate-12">
        <img src="/images/generated-comic/botanical-fern.png" alt="" className="w-48 h-48 object-contain" />
      </div>
      <div className="absolute -bottom-10 -right-10 opacity-20 pointer-events-none rotate-45">
        <img src="/images/generated-comic/botanical-wheat.png" alt="" className="w-64 h-64 object-contain" />
      </div>

      <div className="w-full max-w-4xl space-y-6 relative px-0">
        <div className="home-masthead text-center mb-6">
          <p className="sticker-label">GOOD FRIENDS. QUESTIONABLE ANSWERS.</p>
          <h1 className="font-headline text-on-surface">
            HEN<span>HOUSE</span>
          </h1>
          <p className="text-on-surface-variant font-body text-sm">Party games for the whole flock</p>
        </div>

        {/* Name */}
        <div className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 sm:p-5">
          <label className="block font-label text-[11px] font-bold uppercase tracking-[0.2em] text-info ml-1" htmlFor="player-name">
            01 / Your name
          </label>
          <input
            id="player-name"
            type="text"
            placeholder="Enter name..."
            value={name}
            onChange={(e) => { saveName(e.target.value); if (error) setError('') }}
            className={`w-full bg-surface-container-lowest border-2 rounded-xl px-4 py-3.5 text-on-surface placeholder:text-mute font-body focus:ring-2 outline-none transition-all ${
              error ? 'border-error focus:ring-error/20 focus:border-error' : 'border-outline-variant focus:ring-primary/20 focus:border-primary'
            }`}
            maxLength={20}
          />
          {error && (
            <p className="text-error text-sm font-body mt-1 ml-1">{error}</p>
          )}
        </div>

        {/* Join Section */}
        <section
          aria-labelledby="join-heading"
          className="flex flex-col rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 sm:p-5 shadow-sticker"
        >
          <h2 id="join-heading" className="font-label text-[11px] font-bold uppercase tracking-[0.2em] text-info ml-1">
            02 / Join a game
          </h2>
          <p className="text-on-surface-variant text-xs font-body leading-snug mt-2 mb-4 pl-1">
            Have a room code from the host? Enter it here.
          </p>
          <div className="flex gap-3">
            <input
              id="room-code"
              aria-label="Room code"
              type="text"
              placeholder="Room code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="flex-1 min-w-0 bg-surface-container-lowest border-2 border-outline-variant rounded-xl px-4 py-3.5 text-on-surface placeholder:text-mute font-body focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              maxLength={10}
            />
            <button
              type="button"
              onClick={handleJoin}
              disabled={joining}
              className="shrink-0 bg-action text-on-action h-[58px] px-6 rounded-xl font-headline font-bold text-base tracking-wide shadow-sticker hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              {joining ? 'Joining…' : 'JOIN'}
            </button>
          </div>
        </section>

        {/* Or divider */}
        <div className="flex items-center gap-4 py-1">
          <div className="h-px flex-1 bg-outline-variant/40" />
          <span className="font-body text-xs italic text-on-surface-variant">or start a new game</span>
          <div className="h-px flex-1 bg-outline-variant/40" />
        </div>

        {/* Create Section: Game Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Flock Together Tile */}
          <button
            type="button"
            onClick={handleCreateFlock}
            disabled={creatingFlock || creatingFowlWords || creatingTruthOrTurd}
            className="game-tile group rounded-2xl border-2 border-outline-variant bg-surface-container-lowest p-5 text-left shadow-sticker hover:border-primary hover:bg-surface-container-high active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="tile-art w-16 h-16 rounded-2xl bg-deep flex items-center justify-center">
                <img src="/images/generated-comic/flock-icon-midnight.png" alt="" className="w-14 h-14 object-contain" />
              </div>
              <span className="tile-number">01</span>
            </div>
            <h3 className="font-headline text-xl font-bold text-on-surface mb-1">Flock Together</h3>
            <p className="text-on-surface-variant text-sm font-body leading-snug mb-4">
              Match the majority's answer. Based on <em>Herd Mentality</em>.
            </p>
            <div className="tile-action bg-action text-on-action h-12 rounded-xl flex items-center justify-center font-headline font-bold text-sm tracking-wide group-hover:opacity-90 transition-opacity">
              {creatingFlock ? 'CREATING…' : 'CREATE'}
            </div>
          </button>

          {/* Fowl Words Tile */}
          <button
            type="button"
            onClick={handleCreateFowlWords}
            disabled={creatingFlock || creatingFowlWords || creatingTruthOrTurd}
            className="game-tile group rounded-2xl border-2 border-outline-variant bg-surface-container-lowest p-5 text-left shadow-sticker hover:border-primary hover:bg-surface-container-high active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="tile-art w-16 h-16 rounded-2xl bg-deep flex items-center justify-center">
                <img src="/images/generated-comic/fowl-icon.png" alt="" className="w-14 h-14 object-contain" />
              </div>
              <span className="tile-number">02</span>
            </div>
            <h3 className="font-headline text-xl font-bold text-on-surface mb-1">Fowl Words</h3>
            <p className="text-on-surface-variant text-sm font-body leading-snug mb-4">
              Give a clever one-word clue. Based on <em>Just One</em>.
            </p>
            <div className="tile-action bg-action text-on-action h-12 rounded-xl flex items-center justify-center font-headline font-bold text-sm tracking-wide group-hover:opacity-90 transition-opacity">
              {creatingFowlWords ? 'CREATING…' : 'CREATE'}
            </div>
          </button>

          {/* Truth or Turd Tile */}
          <button
            type="button"
            onClick={handleCreateTruthOrTurd}
            disabled={creatingFlock || creatingFowlWords || creatingTruthOrTurd}
            className="game-tile group rounded-2xl border-2 border-outline-variant bg-surface-container-lowest p-5 text-left shadow-sticker hover:border-primary hover:bg-surface-container-high active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="tile-art w-16 h-16 rounded-2xl bg-deep flex items-center justify-center">
                <img src="/images/generated-comic/truth-or-turd-icon.png" alt="" className="w-14 h-14 object-contain" />
              </div>
              <span className="tile-number">03</span>
            </div>
            <h3 className="font-headline text-xl font-bold text-on-surface mb-1">Truth or Turd</h3>
            <p className="text-on-surface-variant text-sm font-body leading-snug mb-4">
              Decide if oddball trivia is true or total nonsense.
            </p>
            <div className="tile-action bg-action text-on-action h-12 rounded-xl flex items-center justify-center font-headline font-bold text-sm tracking-wide group-hover:opacity-90 transition-opacity">
              {creatingTruthOrTurd ? 'CREATING…' : 'CREATE'}
            </div>
          </button>
        </div>

        <img src="/images/generated-comic/footprint-divider.png" alt="" className="w-full max-w-xs h-14 object-contain opacity-60 mx-auto mt-8" />
      </div>
    </div>
  )
}
