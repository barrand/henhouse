import { useState, useEffect, useRef } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import { submitGuess, unlockFirst, advanceRound, submitClueStarVote, submitClueThumbsDownVote } from '../service'
import PointCounter from './PointCounter'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  currentPlayer: PlayerData | null
  isGuesser: boolean
  isHost: boolean
}

// Imperative animation helpers — run on the button DOM node directly so
// re-tapping the same button always restarts the animation.
function animateBtn(btn: HTMLButtonElement, type: 'up' | 'down') {
  const cls = type === 'up' ? 'animate-thumb-punch' : 'animate-thumb-shake'
  btn.classList.remove(cls)
  void btn.offsetWidth // force reflow so removing+adding restarts animation
  btn.classList.add(cls)
  btn.addEventListener('animationend', () => btn.classList.remove(cls), { once: true })
}

function burstParticles(btn: HTMLButtonElement, type: 'up' | 'down') {
  const r = btn.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const colors = type === 'up'
    ? ['#91c595', '#c4e5c5', '#4caf66', '#b8e4bc']
    : ['#f08080', '#e05050', '#c44444', '#f4a0a0']
  const count = type === 'up' ? 8 : 5
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div')
    const angle = (i / count) * Math.PI * 2
    const dist = type === 'up' ? 24 + Math.random() * 16 : 16 + Math.random() * 12
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist - (type === 'up' ? 8 : 0)
    p.style.cssText = [
      'position:fixed', 'width:6px', 'height:6px', 'border-radius:50%',
      'pointer-events:none', 'z-index:9999',
      `left:${cx}px`, `top:${cy}px`,
      `background:${colors[i % colors.length]}`,
      'animation:thumb-particle 0.5s ease-out forwards',
      `--thumb-dx:${dx}px`, `--thumb-dy:${dy}px`,
    ].join(';')
    document.body.appendChild(p)
    setTimeout(() => p.remove(), 550)
  }
}

export default function RevealView({ game, round, players, currentPlayer, isGuesser, isHost }: Props) {
  const [guess, setGuess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [error, setError] = useState('')
  const [timeLeft, setTimeLeft] = useState(60)
  const guessRef = useRef(guess)
  const autoSubmittedRef = useRef(false)

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

  const myStarVote = currentPlayer ? (round.clueStarVotes?.[currentPlayer.id] ?? null) : null
  const myThumbsDownVote = currentPlayer ? (round.clueThumbsDownVotes?.[currentPlayer.id] ?? null) : null

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

  const handleThumbUp = (groupIndex: number, e: React.MouseEvent<HTMLButtonElement>) => {
    if (!currentPlayer) return
    // Cross-type clear: if voter has 👎 on this same group, toggle it off
    if (myThumbsDownVote === groupIndex) {
      submitClueThumbsDownVote(game.id, game.currentRound, groupIndex).catch(() => {})
    }
    submitClueStarVote(game.id, game.currentRound, groupIndex).catch(() => {})
    animateBtn(e.currentTarget, 'up')
    burstParticles(e.currentTarget, 'up')
  }

  const handleThumbDown = (groupIndex: number, e: React.MouseEvent<HTMLButtonElement>) => {
    if (!currentPlayer) return
    // Cross-type clear: if voter has 👍 on this same group, toggle it off
    if (myStarVote === groupIndex) {
      submitClueStarVote(game.id, game.currentRound, groupIndex).catch(() => {})
    }
    submitClueThumbsDownVote(game.id, game.currentRound, groupIndex).catch(() => {})
    animateBtn(e.currentTarget, 'down')
    burstParticles(e.currentTarget, 'down')
  }

  const allDuplicates = visibleSet.size === 0 && round.clueGroups.length > 0

  return (
    <main className="flex-1 flex flex-col px-4 py-4">
      <div className="max-w-md w-full mx-auto space-y-3">
        {/* Secret word — givers only */}
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

        {/* Point counter — compact bar for everyone */}
        <PointCounter currentAttempt={round.currentAttempt} maxAttempts={round.maxAttempts} compact={true} />

        {/* Heading */}
        {isGuesser ? (
          <div className="text-center">
            <h2 className="font-headline text-lg font-bold text-on-surface">
              {allDuplicates ? 'All clues are duplicates!' : round.currentAttempt === 1 ? 'Your clues' : 'New clue unlocked!'}
            </h2>
            <p className="text-on-surface-variant text-xs mt-0.5 font-body">
              {allDuplicates
                ? 'Everyone thought of the same thing. Unlock one to see it.'
                : round.currentAttempt === 1
                ? 'Take a beat. Then guess.'
                : 'Try again — points just dropped.'}
            </p>
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
                : round.eliminationReason && round.currentAttempt === 1
                ? round.eliminationReason
                : 'Tap 👍 or 👎 on others\' clues'}
            </p>
          </div>
        )}

        {/* All-duplicates state */}
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

        {/* Clue groups — 2-col grid for both giver and guesser */}
        {!allDuplicates && (
          <div className="grid grid-cols-2 gap-2 items-start">
            {round.clueGroups.map((group, idx) => {
              const isVisible = visibleSet.has(idx)
              if (isGuesser && !isVisible) return null

              const uniqueTexts = Array.from(new Set(group.clueTexts.map((t) => t.trim())))
              const showVariants = uniqueTexts.length > 1
              // Duplicates are eliminated because they matched — showing all variants is redundant
              const displayText = !isVisible ? group.clueTexts[0] : uniqueTexts.join(' / ')
              const justUnlocked = round.lastUnlockedGroupIndex === idx
              const thumbsUpCount = Object.values(round.clueStarVotes ?? {}).filter((v) => v === idx).length
              const thumbsDownCount = Object.values(round.clueThumbsDownVotes ?? {}).filter((v) => v === idx).length

              if (isVisible) {
                if (isGuesser) {
                  // Guesser: read-only 2-col card with live community sentiment
                  return (
                    <div
                      key={idx}
                      className={`relative bg-surface-container-lowest rounded-2xl border-2 shadow-sm px-3 py-2.5 transition-all ${
                        justUnlocked
                          ? 'border-tertiary scale-[1.02] shadow-[0_8px_24px_rgba(255,200,100,0.3)]'
                          : group.isDuplicate
                          ? 'border-tertiary/50'
                          : 'border-primary/40'
                      }`}
                    >
                      {justUnlocked && (
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-tertiary-container text-on-tertiary-container text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full font-label">
                          🔓 Just unlocked
                        </span>
                      )}
                      <p className="font-headline font-bold text-on-surface text-center text-lg break-words line-clamp-2">{displayText}</p>
                      {showVariants && (
                        <p className="text-[10px] text-outline text-center mt-0.5 italic font-body">same word</p>
                      )}
                      <p className="text-on-surface-variant text-center font-body text-[10px] mt-0.5">
                        {group.playerIds.length === 1
                          ? `from ${playerName(group.playerIds[0])}`
                          : `from ${group.playerIds.map(playerName).join(', ')}`}
                      </p>
                      {(thumbsUpCount > 0 || thumbsDownCount > 0) && (
                        <div className="flex justify-center gap-3 mt-1.5">
                          {thumbsUpCount > 0 && (
                            <span className="text-[10px] font-bold text-primary font-label">👍 {thumbsUpCount}</span>
                          )}
                          {thumbsDownCount > 0 && (
                            <span className="text-[10px] font-bold text-error font-label">👎 {thumbsDownCount}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                }

                // Giver: compact 2-col card with 👍/👎 vote buttons
                const isOwnClue = currentPlayer ? group.playerIds.includes(currentPlayer.id) : false
                const isMyUp = myStarVote === idx
                const isMyDown = myThumbsDownVote === idx

                return (
                  <div
                    key={idx}
                    className={`relative bg-surface-container-lowest rounded-xl border-2 shadow-sm px-2.5 py-2 transition-all ${
                      justUnlocked
                        ? 'border-tertiary'
                        : isMyUp
                        ? 'border-primary/70 bg-primary/5'
                        : isMyDown
                        ? 'border-error/60 bg-error/5'
                        : 'border-primary/30'
                    }`}
                  >
                    {justUnlocked && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-tertiary-container text-on-tertiary-container text-[9px] font-bold uppercase px-2 py-0.5 rounded-full font-label whitespace-nowrap">
                        🔓 new
                      </span>
                    )}
                    {/* Word + attribution */}
                    <p className="font-headline font-bold text-on-surface text-sm break-words line-clamp-2">{displayText}</p>
                    {showVariants && (
                      <p className="text-[9px] text-outline italic font-body">same word</p>
                    )}
                    <p className="text-[9px] text-on-surface-variant mt-0.5 mb-2 truncate font-body">
                      {isOwnClue
                        ? <span className="text-primary font-bold">← you</span>
                        : `from ${playerName(group.playerIds[0])}`}
                    </p>
                    {/* Vote row — full-width horizontal buttons at bottom of card */}
                    <div className="flex gap-1.5">
                      {isOwnClue ? (
                        // Own clue: read-only count display
                        <>
                          <div className="flex-1 h-7 flex items-center justify-center gap-1 rounded-lg bg-surface-container-low text-[13px] font-label">
                            <span className={thumbsUpCount > 0 ? '' : 'grayscale opacity-30'}>👍</span>
                            {thumbsUpCount > 0 && <span className="text-[10px] font-bold text-primary">{thumbsUpCount}</span>}
                          </div>
                          <div className="flex-1 h-7 flex items-center justify-center gap-1 rounded-lg bg-surface-container-low text-[13px] font-label">
                            <span className={thumbsDownCount > 0 ? '' : 'grayscale opacity-30'}>👎</span>
                            {thumbsDownCount > 0 && <span className="text-[10px] font-bold text-error">{thumbsDownCount}</span>}
                          </div>
                        </>
                      ) : (
                        // Others' clues: tappable buttons — grey silhouette until voted
                        <>
                          <button
                            onClick={(e) => handleThumbUp(idx, e)}
                            className={`flex-1 h-7 flex items-center justify-center gap-1 rounded-lg text-[13px] font-label transition-all active:scale-[0.97] ${
                              isMyUp
                                ? 'bg-primary-fixed shadow-sm'
                                : 'bg-surface-container-low'
                            }`}
                          >
                            <span className={isMyUp ? '' : 'grayscale opacity-40'}>👍</span>
                            {thumbsUpCount > 0 && <span className={`text-[10px] font-bold ${isMyUp ? 'text-on-primary-fixed' : 'text-primary'}`}>{thumbsUpCount}</span>}
                          </button>
                          <button
                            onClick={(e) => handleThumbDown(idx, e)}
                            className={`flex-1 h-7 flex items-center justify-center gap-1 rounded-lg text-[13px] font-label transition-all active:scale-[0.97] ${
                              isMyDown
                                ? 'bg-error-container shadow-sm'
                                : 'bg-surface-container-low'
                            }`}
                          >
                            <span className={isMyDown ? '' : 'grayscale opacity-40'}>👎</span>
                            {thumbsDownCount > 0 && <span className={`text-[10px] font-bold ${isMyDown ? 'text-error' : 'text-error/80'}`}>{thumbsDownCount}</span>}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              }

              // Eliminated / duplicate card — giver only, compact 2-col
              const isPlayerInDupGroup = currentPlayer ? group.playerIds.includes(currentPlayer.id) : false
              return (
                <div
                  key={idx}
                  className={`rounded-xl border px-2.5 py-2 transition-all ${
                    isPlayerInDupGroup
                      ? 'bg-error/10 border-error/40'
                      : 'bg-surface-container-low border-outline-variant/25 opacity-55'
                  }`}
                >
                  <div className="flex items-start gap-1">
                    {isPlayerInDupGroup && (
                      <img src="/images/hen-embarrassed.svg" alt="" className="w-5 h-5 flex-shrink-0 mt-0.5 animate-hen-pop" />
                    )}
                    <p className={`font-headline text-sm font-medium line-through leading-tight truncate flex-1 min-w-0 ${
                      isPlayerInDupGroup ? 'text-error' : 'text-on-surface-variant'
                    }`}>
                      {displayText}
                    </p>
                  </div>
                  <p className="text-[9px] text-outline font-body truncate mt-0.5">
                    {isPlayerInDupGroup ? '😭 ' : ''}{group.playerIds.map(playerName).join(', ')}
                  </p>
                </div>
              )
            })}
          </div>
        )}

        {/* Guesser sticky input */}
        {isGuesser && !allDuplicates && (
          <div className="sticky bottom-0 bg-background pt-2 pb-1 -mx-4 px-4">
            <div className="bg-surface-container-lowest rounded-2xl border-2 border-outline-variant/30 px-4 py-3 space-y-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.3)]">
              {round.guessAttempts?.length > 0 && (
                <div className="text-center space-y-1">
                  <p className="font-label text-[10px] uppercase tracking-wider text-error font-bold">Wrong so far</p>
                  <p className="text-sm text-on-surface-variant font-body">{round.guessAttempts.join(', ')}</p>
                </div>
              )}
              {round.attemptDeadline && (
                <div className="flex items-center justify-between">
                  <span className="font-label text-[10px] uppercase tracking-wider text-secondary font-bold">Your guess</span>
                  <span className={`font-headline text-2xl font-bold tabular-nums transition-colors ${
                    timeLeft <= 10 ? 'text-error' : timeLeft <= 20 ? 'text-tertiary' : 'text-primary'
                  }`}>
                    {timeLeft}s
                  </span>
                </div>
              )}
              {!round.attemptDeadline && (
                <span className="font-label text-[10px] uppercase tracking-wider text-secondary font-bold">Your guess</span>
              )}
              <input
                type="text"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGuess()}
                placeholder="The secret word…"
                maxLength={100}
                autoFocus
                disabled={submitting}
                className="w-full bg-surface-container-lowest border-2 border-outline-variant/30 rounded-xl px-4 py-3 text-lg text-on-surface placeholder:text-outline/50 font-body focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              />
              <button
                onClick={handleGuess}
                disabled={submitting || !guess.trim()}
                className="w-full bg-primary text-on-primary h-14 rounded-xl font-body font-bold tracking-wide hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
              >
                {submitting ? 'Checking…' : 'Submit guess'}
              </button>
              {error && <p className="text-center text-error text-sm font-body">{error}</p>}
            </div>
          </div>
        )}

        {/* Giver footer */}
        {!isGuesser && !allDuplicates && (
          <div className="text-center space-y-2 mt-2">
            {round.guessAttempts?.length > 0 && (
              <div className="space-y-1">
                <p className="font-label text-[10px] uppercase tracking-wider text-error font-bold">Wrong so far</p>
                <p className="text-sm text-on-surface-variant font-body">{round.guessAttempts.join(', ')}</p>
              </div>
            )}
            <p className="text-outline text-sm animate-pulse font-body">
              Watching {guesserPlayer?.name} think…
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
    </main>
  )
}
