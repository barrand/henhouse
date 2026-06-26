import { useState, useEffect, useRef } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import { submitGuess, unlockFirst, advanceRound, submitCluePeerLoveVote, submitCluePeerBooVote } from '../service'
import PointCounter from './PointCounter'
import { animateThumbBtn } from './thumbVoteFx'
import { spawnHeartFloat, spawnBooFloat, pulseCardLove, shakeCardBoo } from './reactionFx'
import {
  GIVER_REVEAL_HINT,
  effectivePeerLoveVotes,
  effectivePeerBooVotes,
  countGroupPeerLoves,
  countGroupPeerBoos,
  myLovedGroups,
  PeerLoveChip,
  PeerBooChip,
} from './clueVoteUi'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  currentPlayer: PlayerData | null
  isGuesser: boolean
  isHost: boolean
  onLoveToggle?: (groupIdx: number) => void
  onBooToggle?: (groupIdx: number) => void
}

export default function RevealView({
  game, round, players, currentPlayer, isGuesser, isHost,
  onLoveToggle, onBooToggle,
}: Props) {
  const [guess, setGuess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [error, setError] = useState('')
  const [timeLeft, setTimeLeft] = useState(60)
  const guessRef = useRef(guess)
  const autoSubmittedRef = useRef(false)
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({})

  useEffect(() => { guessRef.current = guess }, [guess])

  useEffect(() => {
    if (!round.attemptDeadline || !isGuesser) return
    autoSubmittedRef.current = false
    const deadlineMs = round.attemptDeadline.seconds * 1000
    const tick = async () => {
      const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0 && !autoSubmittedRef.current && !submitting) {
        autoSubmittedRef.current = true
        const currentGuess = guessRef.current.trim() || '---'
        try { await submitGuess(game.id, game.currentRound, currentGuess) } catch { /* ignore */ }
      }
    }
    tick()
    const interval = setInterval(tick, 500)
    return () => clearInterval(interval)
  }, [round.attemptDeadline?.seconds, round.currentAttempt]) // eslint-disable-line react-hooks/exhaustive-deps

  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? 'Unknown'
  const visibleSet = new Set(round.visibleGroupIndexes)
  const guesserPlayer = players.find((p) => p.id === game.currentGuesser)

  const peerLoveVotes = effectivePeerLoveVotes(round.cluePeerLoveVotes, round.clueStarVotes)
  const peerBooVotes = effectivePeerBooVotes(round.cluePeerBooVotes, round.clueThumbsDownVotes)
  const myLoves = myLovedGroups(peerLoveVotes, currentPlayer?.id)
  const myBooVote = currentPlayer ? (peerBooVotes[currentPlayer.id] ?? null) : null

  const handleGuess = async () => {
    if (!guess.trim()) return setError('Take a guess')
    setError('')
    setSubmitting(true)
    try {
      await submitGuess(game.id, game.currentRound, guess)
    } catch (err: any) {
      setError(err.message ?? "Couldn't submit your guess")
      setSubmitting(false)
    }
  }

  const handleUnlockFirst = async () => {
    setUnlocking(true)
    try {
      await unlockFirst(game.id, game.currentRound)
    } catch (err: any) {
      setError(err.message ?? "Couldn't unlock clue")
      setUnlocking(false)
    }
  }

  const handleLoveToggle = (groupIdx: number, e: React.MouseEvent<HTMLButtonElement>) => {
    const isAdding = !myLoves.has(groupIdx)
    animateThumbBtn(e.currentTarget, 'up')
    if (isAdding) {
      spawnHeartFloat(e.currentTarget)
      const card = cardRefs.current[groupIdx]
      if (card) pulseCardLove(card)
    }
    if (onLoveToggle) {
      onLoveToggle(groupIdx)
    } else {
      if (myBooVote === groupIdx) {
        submitCluePeerBooVote(game.id, game.currentRound, groupIdx).catch(() => {})
      }
      submitCluePeerLoveVote(game.id, game.currentRound, groupIdx).catch(() => {})
    }
  }

  const handleBooToggle = (groupIdx: number, e: React.MouseEvent<HTMLButtonElement>) => {
    const isAdding = myBooVote !== groupIdx
    animateThumbBtn(e.currentTarget, 'down')
    if (isAdding) {
      spawnBooFloat(e.currentTarget)
      const card = cardRefs.current[groupIdx]
      if (card) shakeCardBoo(card)
    }
    if (onBooToggle) {
      onBooToggle(groupIdx)
    } else {
      if (myLoves.has(groupIdx)) {
        submitCluePeerLoveVote(game.id, game.currentRound, groupIdx).catch(() => {})
      }
      submitCluePeerBooVote(game.id, game.currentRound, groupIdx).catch(() => {})
    }
  }

  const allDuplicates = visibleSet.size === 0 && round.clueGroups.length > 0

  const clueGroupDisplayOrder = isGuesser
    ? round.clueGroups.map((_, idx) => idx).filter((idx) => visibleSet.has(idx))
    : [
        ...round.clueGroups.map((_, idx) => idx).filter((idx) => visibleSet.has(idx)),
        ...round.clueGroups.map((_, idx) => idx).filter((idx) => !visibleSet.has(idx)),
      ]

  return (
    <main className="flex-1 flex flex-col px-4 py-4">
      <div className="max-w-md w-full mx-auto space-y-3">
        {!isGuesser && (
          <div className="bg-primary-fixed border-2 border-primary-fixed-dim rounded-2xl px-4 py-3 text-center shadow-sm">
            <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-primary-fixed-variant font-bold mb-0.5">
              The secret word
            </p>
            <p className="font-headline text-3xl font-bold text-on-primary-fixed tracking-tight">
              {round.secretWord}
            </p>
          </div>
        )}

        <PointCounter currentAttempt={round.currentAttempt} maxAttempts={round.maxAttempts} compact={true} />

        {isGuesser ? (
          <div className="text-center">
            <h2 className="font-headline text-lg font-bold text-on-surface">
              {allDuplicates ? 'All clues are duplicates!' : round.currentAttempt === 1 ? 'Your clues' : 'New clue unlocked!'}
            </h2>
            {(allDuplicates || round.currentAttempt > 1) && (
              <p className="text-on-surface-variant text-xs mt-0.5 font-body">
                {allDuplicates
                  ? 'Everyone thought of the same thing. Unlock one to see it.'
                  : 'Try again — points just dropped.'}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center">
            <h2 className="font-headline text-lg font-bold text-on-surface">
              {allDuplicates
                ? <span className="text-error">All duplicates!</span>
                : <><span className="text-primary">{guesserPlayer?.name}</span> is thinking…</>}
            </h2>
            <p className="text-xs text-outline mt-0.5 italic font-body">
              {allDuplicates
                ? `Every clue matched — ${guesserPlayer?.name} is unlocking the first one`
                : GIVER_REVEAL_HINT}
            </p>
          </div>
        )}

        {allDuplicates && (
          <div className="bg-surface-container-lowest rounded-2xl border-2 border-outline-variant/30 p-6 text-center space-y-4 shadow-sm">
            <img src="/images/hen-embarrassed.svg" alt="" className="w-16 h-16 mx-auto" />
            <div>
              <p className="font-headline text-lg font-bold text-on-surface">Every clue matched</p>
              <p className="text-on-surface-variant text-sm mt-1 font-body">
                {isGuesser
                  ? "No unique clues to see. Unlock the first duplicate to get a hint — but you'll be guessing for 5 pts."
                  : 'All clues were duplicates. The guesser needs to unlock one to continue.'}
              </p>
            </div>
            {!isGuesser && (
              <p className="text-xs text-outline font-body">
                {round.clueGroups.length} duplicate group{round.clueGroups.length !== 1 ? 's' : ''} locked
              </p>
            )}
            {isGuesser && (
              <button
                onClick={handleUnlockFirst}
                disabled={unlocking}
                className="w-full bg-tertiary-container text-on-tertiary-container h-12 rounded-xl font-body font-bold tracking-wide hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
              >
                {unlocking ? 'Unlocking…' : 'Unlock first clue → 5 pts'}
              </button>
            )}
            {!isGuesser && (
              <div className="space-y-2">
                <p className="text-xs text-outline animate-pulse font-body">
                  Waiting for {guesserPlayer?.name} to unlock…
                </p>
                {isHost && (
                  <button
                    onClick={() => advanceRound(game.id).catch(() => {})}
                    className="text-xs text-outline underline hover:text-on-surface-variant font-body"
                  >
                    Skip this round
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {!allDuplicates && (
          <div className={`grid grid-cols-2 ${isGuesser ? 'gap-1.5' : 'gap-2'}`}>
            {clueGroupDisplayOrder.map((idx) => {
              const group = round.clueGroups[idx]
              const isVisible = visibleSet.has(idx)
              const displayText = group.clueTexts[0]?.trim() || '—'
              const justUnlocked = round.lastUnlockedGroupIndex === idx
              const loveCount = countGroupPeerLoves(peerLoveVotes, idx)
              const booCount = countGroupPeerBoos(peerBooVotes, idx)

              if (isVisible) {
                if (isGuesser) {
                  const author =
                    group.playerIds.length === 1
                      ? playerName(group.playerIds[0])
                      : group.playerIds.map(playerName).join(', ')
                  return (
                    <div
                      key={idx}
                      className={`relative bg-surface-container-lowest rounded-xl border px-2 py-1.5 transition-all ${
                        justUnlocked
                          ? 'border-tertiary shadow-[0_4px_16px_rgba(255,200,100,0.25)]'
                          : group.isDuplicate
                          ? 'border-tertiary/50'
                          : 'border-primary/35'
                      }`}
                    >
                      {justUnlocked && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-tertiary-container text-on-tertiary-container text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full font-label whitespace-nowrap">
                          🔓 new
                        </span>
                      )}
                      <p className="font-headline font-bold text-on-surface text-center text-lg leading-tight line-clamp-2 h-11 flex items-center justify-center">
                        {displayText}
                      </p>
                      <p className="text-on-surface-variant text-center font-body text-[10px] font-medium leading-snug h-4 truncate">
                        {author}
                      </p>
                      {(loveCount > 0 || booCount > 0) && (
                        <div className="mt-1 flex items-center justify-center gap-1">
                          <PeerLoveChip count={loveCount} />
                          <PeerBooChip count={booCount} />
                        </div>
                      )}
                    </div>
                  )
                }

                const isOwnClue = currentPlayer ? group.playerIds.includes(currentPlayer.id) : false
                const isMyLoved = myLoves.has(idx)
                const isMyBoo = myBooVote === idx

                return (
                  <div
                    key={idx}
                    ref={(el) => { cardRefs.current[idx] = el }}
                    className={`relative bg-surface-container-lowest rounded-xl border-2 shadow-sm px-2.5 py-1.5 transition-all ${
                      justUnlocked ? 'border-tertiary'
                      : isMyLoved ? 'border-love/70 bg-love/5'
                      : isMyBoo ? 'border-error/60 bg-error/5'
                      : 'border-primary/30'
                    }`}
                  >
                    {justUnlocked && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-tertiary-container text-on-tertiary-container text-[9px] font-bold uppercase px-2 py-0.5 rounded-full font-label whitespace-nowrap">
                        🔓 new
                      </span>
                    )}
                    <p className="font-headline font-bold text-on-surface text-xl leading-tight text-center line-clamp-2 h-11 flex items-center justify-center mb-0.5">
                      {displayText}
                    </p>
                    <p className="text-xs text-on-surface-variant font-medium mb-1.5 font-body text-center leading-snug h-4 truncate">
                      {group.playerIds.length === 1 ? (
                        isOwnClue ? <span className="text-primary font-bold">← you</span> : playerName(group.playerIds[0])
                      ) : (
                        group.playerIds.map((id, i) => (
                          <span key={id}>
                            {i > 0 && ', '}
                            {id === currentPlayer?.id ? <span className="text-primary font-bold">← you</span> : playerName(id)}
                          </span>
                        ))
                      )}
                      {group.isDuplicate && !isOwnClue && (
                        <span className="text-error font-bold uppercase text-[9px] tracking-wide"> · dup</span>
                      )}
                      {isOwnClue && group.isDuplicate && (
                        <span className="text-error font-bold"> · -1</span>
                      )}
                    </p>
                    <div className="flex gap-1.5">
                      {isOwnClue ? (
                        <>
                          <div className="flex-1 h-9 flex flex-col items-center justify-center gap-0 rounded-lg bg-surface-container-low font-label">
                            <span className={`text-lg leading-none ${loveCount > 0 ? '' : 'grayscale opacity-30'}`}>❤️</span>
                            {loveCount > 0 && <span className="text-[9px] font-bold text-love leading-none">{loveCount}</span>}
                          </div>
                          <div className="flex-1 h-9 flex flex-col items-center justify-center gap-0 rounded-lg bg-surface-container-low font-label">
                            <span className={`text-lg leading-none ${booCount > 0 ? '' : 'grayscale opacity-30'}`}>👎</span>
                            {booCount > 0 && <span className="text-[9px] font-bold text-error leading-none">{booCount}</span>}
                          </div>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={(e) => handleLoveToggle(idx, e)}
                            aria-label={`Love clue: ${displayText}`}
                            title="Love this clue (+1 pt if we win)"
                            className={`flex-1 h-9 flex flex-col items-center justify-center gap-0 rounded-lg font-label transition-all active:scale-[0.97] ${
                              isMyLoved ? 'bg-love-container shadow-sm' : 'bg-surface-container-low'
                            }`}
                          >
                            <span className={`text-lg leading-none ${isMyLoved ? '' : 'grayscale opacity-40'}`}>❤️</span>
                            {loveCount > 0 && (
                              <span className={`text-[9px] font-bold leading-none ${isMyLoved ? 'text-on-love-container' : 'text-love'}`}>
                                {loveCount}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={(e) => handleBooToggle(idx, e)}
                            aria-label={`Boo clue: ${displayText}`}
                            title="Boo this clue (fun only — no point penalty)"
                            className={`flex-1 h-9 flex flex-col items-center justify-center gap-0 rounded-lg font-label transition-all active:scale-[0.97] ${
                              isMyBoo ? 'bg-error-container shadow-sm' : 'bg-surface-container-low'
                            }`}
                          >
                            <span className={`text-lg leading-none ${isMyBoo ? '' : 'grayscale opacity-40'}`}>👎</span>
                            {booCount > 0 && (
                              <span className={`text-[9px] font-bold leading-none ${isMyBoo ? 'text-error' : 'text-error/80'}`}>
                                {booCount}
                              </span>
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              }

              const isPlayerInDupGroup = currentPlayer ? group.playerIds.includes(currentPlayer.id) : false
              return (
                <div
                  key={idx}
                  className={`relative rounded-xl border border-dashed px-2.5 py-1.5 opacity-50 transition-all ${
                    isPlayerInDupGroup ? 'bg-error/8 border-error/40' : 'bg-surface-container border-outline-variant/40'
                  }`}
                >
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-surface-container-highest text-outline text-[9px] font-bold uppercase px-2 py-0.5 rounded-full font-label whitespace-nowrap border border-outline-variant/50">
                    🔒 hidden from {guesserPlayer?.name ?? 'guesser'}
                  </span>
                  <p className={`font-headline text-lg font-bold line-through leading-tight text-center line-clamp-2 h-11 flex items-center justify-center ${
                    isPlayerInDupGroup ? 'text-error/70' : 'text-on-surface-variant/70'
                  }`}>
                    {displayText}
                  </p>
                  <p className="text-xs text-outline font-medium font-body truncate text-center">
                    {group.playerIds.map(playerName).join(', ')}
                    {!isPlayerInDupGroup && (
                      <span className="text-error/70 font-bold uppercase text-[9px] tracking-wide"> · dup</span>
                    )}
                    {isPlayerInDupGroup && <span className="text-error/70 font-bold"> · -1</span>}
                  </p>
                </div>
              )
            })}
          </div>
        )}

        {isGuesser && !allDuplicates && (
          <div className="sticky bottom-0 bg-background pt-2 pb-1 -mx-4 px-4">
            <div className="bg-surface-container-lowest rounded-2xl border-2 border-outline-variant/30 px-3 py-2.5 space-y-2 shadow-[0_-4px_16px_rgba(0,0,0,0.3)]">
              {round.guessAttempts?.length > 0 && (
                <p className="text-xs text-on-surface-variant font-body truncate">
                  <span className="font-label text-[10px] uppercase tracking-wider text-error font-bold mr-1.5">Wrong</span>
                  {round.guessAttempts.join(', ')}
                </p>
              )}
              <div className="flex items-stretch rounded-xl border-2 border-outline overflow-hidden bg-surface-container-low focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                {round.attemptDeadline && (
                  <span className={`shrink-0 flex items-center px-2.5 font-headline text-sm font-bold tabular-nums border-r border-outline-variant/40 ${
                    timeLeft <= 10 ? 'text-error' : timeLeft <= 20 ? 'text-tertiary' : 'text-primary'
                  }`} aria-label={`${timeLeft} seconds left`}>
                    {timeLeft}s
                  </span>
                )}
                <label className="sr-only" htmlFor="guesser-guess-input">Your guess</label>
                <span className="shrink-0 self-center pl-2 pr-0.5 font-label text-[9px] uppercase tracking-wide text-secondary font-bold whitespace-nowrap" aria-hidden>
                  Your guess
                </span>
                <input
                  id="guesser-guess-input"
                  type="text"
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGuess()}
                  placeholder="The secret word…"
                  maxLength={100}
                  autoFocus
                  disabled={submitting}
                  className="flex-1 min-w-0 bg-transparent border-0 px-2 py-2.5 text-base text-on-surface placeholder:text-outline/50 font-body outline-none"
                />
                <button
                  type="button"
                  onClick={handleGuess}
                  disabled={submitting || !guess.trim()}
                  className="shrink-0 bg-primary text-on-primary px-4 py-2.5 font-body font-bold tracking-wide hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all border-l border-primary-fixed-dim"
                >
                  {submitting ? '…' : 'Submit'}
                </button>
              </div>
              {error && <p className="text-center text-error text-xs font-body">{error}</p>}
            </div>
          </div>
        )}

        {!isGuesser && !allDuplicates && (
          <div className="text-center space-y-2 mt-2">
            {round.guessAttempts?.length > 0 && (
              <div className="space-y-1">
                <p className="font-label text-[10px] uppercase tracking-wider text-error font-bold">Wrong so far</p>
                <p className="text-sm text-on-surface-variant font-body">{round.guessAttempts.join(', ')}</p>
              </div>
            )}
            <p className="text-outline text-sm animate-pulse font-body">Watching {guesserPlayer?.name} think…</p>
            {isHost && (
              <button onClick={() => advanceRound(game.id).catch(() => {})} className="text-xs text-outline underline hover:text-on-surface-variant font-body">
                Skip this round
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
