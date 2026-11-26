import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../hooks/usePlayer'
import { setupPresence } from '../../../lib/presence'
import BottomActionDock from '../../../shared/BottomActionDock'
import SharedViewLink from '../../../shared/SharedViewLink'
import { useRoomId } from '../../../shared/useRoomId'
import { usePresentationClock } from '../../../shared/presentationClock'
import { ItWasYouBoard, Rankings } from '../Board'
import { useGame, usePlayerView, useVoteTotals } from '../hooks/useGame'
import { rematch, roundAction } from '../service'
import type { Action, RoundAction } from '../types'
import {
  MAX_ANSWER_LENGTH, MIN_ANSWERS, MIN_PLAYERS,
} from '../../../../functions/src/games/it-was-you/model'

const artRoot = '/images/generated-comic/midnight/'
const primary = 'min-h-12 w-full rounded-xl bg-action px-4 font-headline font-bold text-on-action hover:opacity-90 disabled:opacity-50'
const secondary = 'min-h-12 w-full rounded-xl border border-outline-variant/60 bg-surface-container-low px-4 font-bold hover:border-primary disabled:opacity-50'

function WritingForm({ busy, onSubmit }: { busy: boolean; onSubmit: (text: string) => Promise<void> }) {
  const [text, setText] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!busy && text.trim()) void onSubmit(text.trim())
  }
  return <form onSubmit={submit} className="space-y-3">
    <label htmlFor="funny-answer" className="block font-bold">Write the funniest answer you can think of!</label>
    <textarea id="funny-answer" rows={3} maxLength={MAX_ANSWER_LENGTH} value={text} onChange={event => setText(event.target.value)}
      className="w-full resize-y rounded-xl border-2 border-outline bg-surface-container-low px-4 py-3 focus:border-primary focus:outline-none" />
    <button type="submit" className={primary} disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send answer'}</button>
  </form>
}

export default function Game() {
  const { code } = useParams<{ code: string }>()
  const { uid, loading: authLoading } = useAuth()
  const { gameId, lookupError } = useRoomId(code, uid)
  const navigate = useNavigate()
  const { game, member, loading, players, round } = useGame(gameId, uid)

  useEffect(() => {
    if (gameId && member) return setupPresence(gameId)
  }, [gameId, member, uid])

  useEffect(() => {
    if (game?.rematchCode) navigate('/it-was-you/' + game.rematchCode, { replace: true })
    else if (game?.status === 'abandoned') navigate('/', { replace: true })
  }, [game?.rematchCode, game?.status, navigate])

  if (lookupError) return <RoomMessage message={lookupError} />
  if (!authLoading && !uid) return <RoomMessage message="Couldn’t sign in. Reload the page and try again." />
  if (game?.gameType && game.gameType !== 'it-was-you') return <RoomMessage message="That room belongs to another game." />
  if (authLoading || loading || !gameId || !uid) return <RoomMessage message="Opening room…" />
  if (!game || !member) return <RoomMessage message="Join this room from the home screen to play." />
  return <Play key={gameId} gameId={gameId} uid={uid} game={game} players={players} round={round} />
}

function RoomMessage({ message }: { message: string }) {
  return <main className="mx-auto max-w-lg space-y-4 px-4 py-10">
    <p role="status">{message}</p>
    <Link to="/" className="text-info underline">Back to Henhouse</Link>
  </main>
}

type GameSnapshot = ReturnType<typeof useGame>
type PlayProps = Pick<GameSnapshot, 'players' | 'round'> & {
  game: NonNullable<GameSnapshot['game']>
  gameId: string
  uid: string
}

function Play({ gameId, uid, game, players, round }: PlayProps) {
  const { currentRound: roundNum } = game
  const revision = round?.revision ?? 0
  const isHost = game.hostId === uid
  const view = usePlayerView(gameId, roundNum, uid)
  const totals = useVoteTotals(gameId, roundNum, round?.phase === 'voting' ? round.answer?.id : undefined)
  const now = usePresentationClock(!!round && (round.deadline > 0 || !!round.reveal), 150)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ key: string; message: string }>()
  const [confirm, setConfirm] = useState<{ key: string; action: 'close' | 'abandon' }>()
  const key = roundNum + ':' + revision
  const actionError = error?.key === key ? error.message : ''
  const awaiting = confirm?.key === key ? confirm.action : null
  const deadline = round?.deadline ?? 0
  const expired = deadline > 0 && now >= deadline

  useEffect(() => {
    if (!expired) return
    let pending = false
    function expire() {
      if (pending || !navigator.onLine) return
      pending = true
      void roundAction({ gameId, roundNum, revision, action: 'close' }).catch(() => {
        // A member can retry until the server clock expires or the room reconnects.
      }).finally(() => { pending = false })
    }
    const jitter = window.setTimeout(expire, Math.random() * 350)
    const retry = window.setInterval(expire, 2000)
    return () => { window.clearTimeout(jitter); window.clearInterval(retry) }
  }, [expired, gameId, revision, roundNum])

  async function act(action: Action, extra: Pick<RoundAction, 'text' | 'answerId' | 'candidateId'> & { early?: boolean } = {}) {
    if (busy) return
    setBusy(true)
    setError(undefined)
    setConfirm(undefined)
    try {
      await roundAction({ gameId, roundNum, revision, action, ...extra })
    } catch (failure) {
      setError({ key, message: failure instanceof Error ? failure.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  async function playAgain() {
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      await rematch({ gameId })
    } catch (failure) {
      setError({ key, message: failure instanceof Error ? failure.message : 'Couldn’t start a rematch.' })
    } finally {
      setBusy(false)
    }
  }

  const names = new Map(players.map(player => [player.id, player.name]))
  const name = (id: string) => names.get(id) ?? 'Player'
  const selected = view?.answerId === round?.answer?.id ? view?.candidateId : undefined
  const voter = !!round?.eligiblePlayerIds.includes(uid)
  const writer = !!round?.writerIds.includes(uid)
  const reveal = round?.reveal
  const revealed = reveal && now >= reveal.revealAt
  const pickedAuthor = revealed && !reveal.automatic && uid !== reveal.authorId && selected === reveal.authorId
  const points = pickedAuthor ? (reveal.leaders.length === 1 && reveal.leaders[0] === reveal.authorId ? 2 : 1) : 0
  const connected = players.filter(player => player.connected).length
  const canAdvance = game.status === 'playing' && !!round && (round.phase === 'standings' || (round.phase === 'reveal' && revealed))
  const closeLabel = round?.phase === 'writing' ? 'Start guessing' : 'Reveal now'
  const canClose = !expired && (round?.phase === 'writing' && round.submitted >= MIN_ANSWERS || round?.phase === 'voting' && totals.voted > 0)
  const lobby = game.status === 'lobby'
  const finished = game.status === 'finished'
  const winningScore = Math.max(...players.map(player => player.score))
  const winners = finished ? players.filter(player => player.score === winningScore).map(player => player.name) : []

  return <div data-action-screen className="min-h-screen bg-surface linen-texture">
    <main className="mx-auto max-w-2xl space-y-5 px-4 pt-5 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/60 pb-3">
        <div>
          <h1 className="font-headline text-2xl font-bold">It Was You!</h1>
          <p className="text-sm text-on-surface-variant">{lobby ? 'Room ' + game.code : finished ? 'Final standings' : 'Round ' + roundNum}</p>
        </div>
        {(!isHost || finished) && <Link to="/" className="inline-flex min-h-11 items-center px-2 text-info underline">Home</Link>}
        {isHost && !finished && awaiting !== 'abandon' && <button type="button" className="min-h-11 px-2 text-on-surface-variant underline"
          onClick={() => setConfirm({ key, action: 'abandon' })}>Leave room</button>}
      </header>

      {lobby && <section className="space-y-4 rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-5">
        <div className="flex items-center gap-4">
          <img src={artRoot + 'hen-magnifying.png'} alt="" className="h-20 w-20 object-contain" />
          <p>Write something funny. Guess who wrote it. Get 1 point for guessing right and 1 more if the room gets it right too.</p>
        </div>
        <p className="font-bold">{connected} connected · 4 needed</p>
        <ul className="flex flex-wrap gap-2">{players.map(player => <li key={player.id}
          className="rounded-xl border border-outline-variant/60 bg-surface-container-low px-3 py-1">{player.name}{!player.connected && ' · Away'}</li>)}</ul>
        {isHost ? <SharedViewLink code={game.code} /> : <p className="text-on-surface-variant">Waiting for the host to start.</p>}
      </section>}
      {finished && <section className="space-y-3">
        <img src={artRoot + 'hen-winner-v2.png'} alt="" className="mx-auto h-32 w-32 animate-hen-celebrate" />
        <h2 className="text-center font-headline text-2xl font-bold">
          {winners.length === 1 ? winners[0] + ' wins!' : winners.length > 1 ? winners.length + '-way tie for first!' : 'Final standings'}
        </h2>
        <Rankings players={players} />
      </section>}
      {!lobby && !finished && !round && <p role="status">Getting the round ready…</p>}
      {!finished && round && round.phase !== 'standings' && <ItWasYouBoard round={round} now={now} name={name}
        counts={totals.counts} voted={totals.voted} selected={selected} pending={busy}
        onVote={voter ? candidateId => void act('vote', { candidateId, answerId: round.answer?.id }) : undefined} />}
      {isHost && round?.phase === 'voting' && <section className="space-y-2 rounded-xl border border-outline-variant/60 bg-surface-container-low p-4" aria-label="Voting status">
        <h2 className="font-bold">Voting status</h2>
        {Object.keys(totals.voters).length < totals.voted && <p className="text-sm text-on-surface-variant">Some votes were recorded before player status was available.</p>}
        <ul className="space-y-1">
          {round.eligiblePlayerIds.map(id => <li key={id} className="flex justify-between gap-3">
            <span className="min-w-0 wrap-anywhere">{name(id)}{id === uid ? ' (you)' : ''}</span>
            <span className="shrink-0 font-bold">{totals.voters[id] ? '✓ Voted' : Object.keys(totals.voters).length < totals.voted ? 'Status unavailable' : 'Waiting'}</span>
          </li>)}
        </ul>
      </section>}
      {round?.phase === 'writing' && (
        writer ? view?.submittedText ? <p className="text-on-surface-variant">Your answer is in.</p>
          : view && !expired && <WritingForm key={key} busy={busy} onSubmit={text => act('submit', { text })} />
          : <p className="text-on-surface-variant">You can guess when the answers go up.</p>
      )}
      {round?.phase === 'voting' && !voter && <p className="text-on-surface-variant">You can vote starting next round.</p>}
      {round?.phase === 'voting' && voter && <p className="text-on-surface-variant">Read it aloud, make your case, and change your vote anytime before the reveal.</p>}
      {revealed && !reveal.automatic && voter && view && <p className="text-lg font-headline font-bold">You earned {points} {points === 1 ? 'point' : 'points'}.</p>}
      {round?.phase === 'standings' && <section className="space-y-3">
        <h2 className="font-headline text-2xl font-bold">{round.shortRound ? 'Not enough answers this round' : 'Round standings'}</h2>
        <Rankings players={players} points={round.pointsThisRound} />
      </section>}
      {awaiting === 'abandon' && <section className="rounded-xl border border-outline-variant/60 bg-surface-container-low p-4 space-y-2">
        <p>Close the room for everyone?</p>
        <button type="button" className={primary} disabled={busy} onClick={() => void act('abandon')}>Close room</button>
        <button type="button" className={secondary} onClick={() => setConfirm(undefined)}>Keep playing</button>
      </section>}
      {actionError && !isHost && <p role="alert" className="text-error">{actionError}</p>}

      {isHost && (lobby || finished || round?.phase === 'preview' || canClose || canAdvance || !!actionError) && <BottomActionDock>
        {actionError && <p role="alert" className="text-error">{actionError}</p>}
        {lobby && <button type="button" className={primary} disabled={busy || connected < MIN_PLAYERS} onClick={() => void act('preview')}>Start game</button>}
        {round?.phase === 'preview' && <>
          <button type="button" className={primary} disabled={busy || connected < MIN_PLAYERS} onClick={() => void act('write')}>Start writing</button>
          {round.canSwap && <button type="button" className={secondary} disabled={busy} onClick={() => void act('swap')}>Swap prompt</button>}
          {connected < MIN_PLAYERS && <p className="text-sm text-on-surface-variant">Four connected players are needed.</p>}
        </>}
        {canClose && (round?.phase === 'voting' ? <button type="button" className={secondary} disabled={busy} onClick={() => void act('close', { early: true })}>{closeLabel}</button> : awaiting === 'close' ? <>
          <button type="button" className={primary} disabled={busy} onClick={() => void act('close', { early: true })}>Confirm {closeLabel.toLowerCase()}</button>
          <button type="button" className={secondary} onClick={() => setConfirm(undefined)}>Keep timer running</button>
        </> : <button type="button" className={secondary} disabled={busy} onClick={() => setConfirm({ key, action: 'close' })}>{closeLabel}</button>)}
        {canAdvance && round?.phase === 'reveal' && <button type="button" className={primary} disabled={busy} onClick={() => void act('advance')}>
          {reveal?.automatic ? 'See standings' : 'Next answer'}
        </button>}
        {round?.phase === 'standings' && <>
          {round.canSwap && <button type="button" className={primary} disabled={busy || connected < MIN_PLAYERS} onClick={() => void act('preview')}>{round.shortRound ? 'Try another prompt' : 'Next round'}</button>}
          <button type="button" className={secondary} disabled={busy} onClick={() => void act('finish')}>Finish game</button>
        </>}
        {finished && <button type="button" className={primary} disabled={busy} onClick={() => void playAgain()}>Play again</button>}
      </BottomActionDock>}
    </main>
  </div>
}
