import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/usePlayer'
import { usePresentationClock } from '../presentationClock'
import { FLOCK_REVEAL_MS, FOWL_DEBRIEF_MS } from '../../../functions/src/shared/sharedViewModel'
import type { DisplayRound } from '../../../functions/src/shared/sharedViewModel'
import { FlockBoard, FowlBoard, Hen } from './DisplayBoards'
import { useDisplaySize } from './displayLayout'
import { useDisplayRoom, type DisplayPlayer } from './useDisplayRoom'
import { useRankMotion } from './useRankMotion'
import './shared-view.css'

function RoomEntry({ initial = '', error = '', retry }: { initial?: string; error?: string; retry?: () => void }) {
  const [code, setCode] = useState(initial)
  const navigate = useNavigate()
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const roomCode = code.trim().toUpperCase()
    if (roomCode === initial && retry) retry()
    else if (roomCode) navigate('/shared/' + encodeURIComponent(roomCode))
  }
  return <section className="display-panel display-entry space-y-5">
    <Hen art="hen-neutral" />
    <h1 className="display-question">Shared View</h1>
    <p className="text-on-surface-variant">Enter a room code to put the game on this screen.</p>
    {error && <p role="alert" className="text-error">{error}</p>}
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="display-code" className="block font-bold">Room code</label>
      <input id="display-code" className="w-full rounded-xl border-2 border-outline bg-surface-container-high px-4 py-3 font-mono uppercase"
        value={code} onChange={event => setCode(event.target.value.toUpperCase())}
        autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={10} required />
      <button type="submit" disabled={!code.trim()} className="w-full min-h-12 rounded-xl bg-action font-bold text-on-action disabled:opacity-50">Open Shared View</button>
    </form>
    <Link to="/" className="inline-block py-2 text-info underline">Back to Henhouse</Link>
  </section>
}

function scoreFor(player: DisplayPlayer, round: DisplayRound | null, now: number) {
  if (!round) return player.score
  if (round.kind === 'flock-together') {
    if (round.phase === 'scored' && (!round.revealAt || now >= round.revealAt + FLOCK_REVEAL_MS)) return round.after[player.id] ?? player.score
    return round.before[player.id] ?? player.score
  }
  const before = round.before[player.id]
  if (before === undefined) return player.score
  return round.phase === 'scored' && (!round.revealAt || now >= round.revealAt + FOWL_DEBRIEF_MS)
    ? before + (round.points[player.id] ?? 0) : before
}

function Standings({ players, lobby, wide, finished }: { players: DisplayPlayer[]; lobby: boolean; wide: boolean; finished: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const root = useRef<HTMLUListElement>(null)
  const limit = 1
  const visible = wide || expanded ? players : players.slice(0, limit)
  useRankMotion(root, visible.map(player => player.id).join(','))
  return <aside className="display-panel display-standings" aria-label={lobby ? 'Players' : 'Standings'}>
    <div className="display-standings-heading">
      <h2 className="font-headline font-bold">{lobby ? 'Players · ' + players.length : 'Standings'}</h2>
      {!wide && players.length > limit && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
        {expanded ? 'Show less' : lobby ? 'All players' : 'Full standings'}
      </button>}
    </div>
    <ul ref={root} className={'display-scores' + (!wide && expanded ? ' display-scores-expanded' : '')} tabIndex={!wide && expanded ? 0 : undefined}>
      {visible.map(player => <li key={player.id} data-ranking={player.id} className={!lobby && player.score === players[0]?.score && (player.score > 0 || finished) ? 'display-leader' : ''}>
        <span className="wrap-anywhere">{player.name}</span>{!lobby && <span className="font-mono tabular-nums">{player.score}</span>}
      </li>)}
    </ul>
  </aside>
}

function Room({ code }: { code: string }) {
  const navigate = useNavigate()
  const { uid, loading } = useAuth()
  const [retry, setRetry] = useState(0)
  const [full, setFull] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')
  const viewport = useDisplaySize()
  const { game, players, round, error, online } = useDisplayRoom(code, uid, retry)
  const settledAt = round?.phase === 'scored' ? round.revealAt + (round.kind === 'flock-together' ? FLOCK_REVEAL_MS : FOWL_DEBRIEF_MS) + 750 : undefined
  const now = usePresentationClock(Boolean(round), round?.phase === 'scored' ? 80 : 250, settledAt)

  useEffect(() => {
    if (game?.rematchCode) navigate('/shared/' + encodeURIComponent(game.rematchCode), { replace: true })
  }, [game?.rematchCode, navigate])

  useEffect(() => {
    const change = () => setFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', change)
    return () => document.removeEventListener('fullscreenchange', change)
  }, [])

  async function fullscreen() {
    setFullscreenError('')
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      setFullscreenError('Fullscreen is unavailable on this screen.')
    }
  }

  if (error && !game) return <RoomEntry initial={code} error={error} retry={() => setRetry(value => value + 1)} key={error} />
  if (!loading && !uid) return <RoomEntry initial={code} error="Couldn’t sign in. Reload the page and try again." />
  if (game?.status === 'abandoned') return <RoomEntry error="This room is closed." />

  const lobby = game?.status === 'lobby'
  const finished = game?.status === 'finished'
  const wide = viewport.width >= 900
  const names = new Map(players.map(player => [player.id, player.name]))
  const name = (id: string) => names.get(id) ?? 'Player'
  const standings = players.map(player => ({ ...player, score: scoreFor(player, round, now) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const winners = standings.filter(player => player.score === standings[0]?.score)
  const winnerTitle = winners.length > 4 ? winners.length + '-way tie for first!'
    : winners.length ? winners.map(player => player.name).join(' · ') + (winners.length === 1 ? ' wins!' : ' tie for first!') : 'Final standings'
  const title = game?.kind === 'fowl-words' ? 'Fowl Words' : game ? 'Flock Together' : 'Shared View'
  const phase = lobby ? 'Lobby' : finished ? 'Game over' : game ? 'Round ' + game.round + ' / ' + game.totalRounds : ''

  return <>
    <header className="display-header">
      <h1>{title}</h1>
      {phase && <span className="display-phase">{phase}</span>}
      <div className="display-header-controls">
        {document.fullscreenEnabled && <button type="button" onClick={() => void fullscreen()}>{full ? 'Exit full screen' : 'Full screen'}</button>}
        <Link to="/shared">Change room</Link>
      </div>
    </header>
    {fullscreenError && <p role="status" className="text-on-surface-variant">{fullscreenError}</p>}
    {(!online || error) && <div role="status" className="display-connection">
      <p>{error || 'Reconnecting…'}</p>
      {error && <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button>}
    </div>}
    {!game ? <p className="display-panel text-lg" role="status">Opening room {code}…</p> : <div className="display-layout">
      <Standings players={standings} lobby={lobby} wide={wide} finished={finished} />
      <main className="display-main">
        {lobby ? <section className="display-panel display-lobby">
          <h2 className="display-question">Join the flock</h2>
          <p className="display-domain">chickenparty.web.app</p>
          <p className="font-mono text-info uppercase tracking-wider">Room code</p>
          <p className="display-room-code">{code}</p>
          {game.kind === 'fowl-words' ? <Hen art="fowl-icon" /> :
            <img src="/images/generated-comic/flock-icon-midnight.png" alt="" className="display-hen animate-hen-bob" />}
          <p className="text-on-surface-variant">Waiting for the host to start</p>
        </section> : finished ? <section className="display-panel display-finish">
          <Hen art="hen-winner-v2" motion="pop" />
          <div>
            <h2 className="display-question">{winnerTitle}</h2>
            {winners.length > 0 && <p className="display-secret">{winners[0].score} points</p>}
            <p className="mt-3 text-on-surface-variant">Waiting for the host to play again</p>
          </div>
        </section> : round?.kind === 'flock-together' ? <FlockBoard key={game.round + ':' + round.instance} round={round} now={now} name={name} {...viewport} />
          : round?.kind === 'fowl-words' ? <FowlBoard key={game.round} identity={code + ':' + game.round} round={round} now={now}
            guesser={game.guesser ? name(game.guesser) : 'The guesser'} name={name} {...viewport} />
            : <section className="display-panel display-waiting" role="status"><p className="display-subtitle">Getting the next round ready…</p><Hen art="hen-thinking" /></section>}
      </main>
    </div>}
  </>
}

export default function SharedView() {
  const code = useParams<{ code: string }>().code?.trim().toUpperCase() ?? ''
  return <div className="shared-display linen-texture">{code ? <Room key={code} code={code} /> : <RoomEntry />}</div>
}
