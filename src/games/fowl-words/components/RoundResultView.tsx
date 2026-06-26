import { useState } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import { advanceRound, submitGuesserStarVote, submitGuesserThumbsDownVote } from '../service'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  isHost: boolean
  currentPlayerId: string | null
}

function animateBtn(btn: HTMLButtonElement, type: 'up' | 'down') {
  const cls = type === 'up' ? 'animate-thumb-punch' : 'animate-thumb-shake'
  btn.classList.remove(cls)
  void btn.offsetWidth
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

export default function RoundResultView({ game, round, players, isHost, currentPlayerId }: Props) {
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState('')
  const [pendingUpIdx, setPendingUpIdx] = useState<number | null>(null)
  const [pendingDownIdx, setPendingDownIdx] = useState<number | null>(null)

  const guesserPlayer = players.find((p) => p.id === game.currentGuesser)
  const isLastRound = game.currentRound >= game.settings.totalRounds
  const isCurrentGuesser = currentPlayerId === game.currentGuesser

  const handleAdvance = async () => {
    setError('')
    setAdvancing(true)
    try {
      await advanceRound(game.id)
    } catch (err: any) {
      setError(err.message ?? "Couldn't move on")
      setAdvancing(false)
    }
  }

  const myPoints = currentPlayerId ? round.pointsThisRound[currentPlayerId] ?? 0 : 0
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)
  const guesserName = guesserPlayer?.name ?? 'The guesser'

  // Back-calculate fast bonus per player from pointsThisRound
  const fastBonusMap: Record<string, number> = {}
  if (round.isCorrect) {
    const attemptPts = [10, 5, 2, 1][round.currentAttempt - 1] ?? 0
    for (let gIdx = 0; gIdx < round.clueGroups.length; gIdx++) {
      const g = round.clueGroups[gIdx]
      if (!round.visibleGroupIndexes.includes(gIdx)) continue
      const giverStarPts = Object.values(round.clueStarVotes ?? {}).filter((v) => v === gIdx).length
      const guesserStarPts = round.guesserStarVote === gIdx ? Math.floor(5 / g.playerIds.length) : 0
      const basePts = attemptPts + (g.isDuplicate ? -1 : 0) + giverStarPts + guesserStarPts
      for (const pid of g.playerIds) {
        const bonus = (round.pointsThisRound[pid] ?? 0) - basePts
        if (bonus > 0) fastBonusMap[pid] = bonus
      }
    }
  }

  const handleGuesserUp = (idx: number, e: React.MouseEvent<HTMLButtonElement>) => {
    if (!round.isCorrect) return
    setPendingUpIdx(idx)
    submitGuesserStarVote(game.id, game.currentRound, idx).catch(() => {})
    animateBtn(e.currentTarget, 'up')
    burstParticles(e.currentTarget, 'up')
  }

  const handleGuesserDown = (idx: number, e: React.MouseEvent<HTMLButtonElement>) => {
    setPendingDownIdx(idx)
    submitGuesserThumbsDownVote(game.id, game.currentRound, idx).catch(() => {})
    animateBtn(e.currentTarget, 'down')
    burstParticles(e.currentTarget, 'down')
  }

  const hasVisibleClues = round.clueGroups.some((_, i) => round.visibleGroupIndexes.includes(i))

  return (
    <main className="flex-1 flex flex-col px-4 py-4">
      <div className="max-w-md w-full mx-auto space-y-4">
        {/* Result Banner */}
        <div className="text-center space-y-2">
          {round.isCorrect ? (
            <>
              <img
                src={round.currentAttempt === 1 ? '/images/hen-excited.svg' : '/images/hen-winner.svg'}
                alt=""
                className={`w-28 h-28 mx-auto ${round.currentAttempt === 1 ? 'animate-hen-celebrate' : 'animate-hen-pop'}`}
              />
              <h2 className="font-headline text-4xl font-bold text-primary tracking-tight">NAILED IT!</h2>
              <p className="text-on-surface-variant font-body text-sm">
                {guesserName} guessed{' '}
                <span className="font-bold text-on-surface">{round.guesserAnswer}</span>
                {round.currentAttempt > 1 && (
                  <span className="block text-xs mt-1 opacity-75">
                    on attempt {round.currentAttempt} of {round.maxAttempts}
                  </span>
                )}
              </p>
            </>
          ) : round.clueGroups.length === 0 ? (
            <>
              <img src="/images/hen-embarrassed.svg" alt="" className="w-28 h-28 mx-auto animate-hen-pop" />
              <h2 className="font-headline text-4xl font-bold text-error tracking-tight">NO CLUES</h2>
              <p className="text-on-surface-variant font-body text-sm">Nobody submitted a clue in time.</p>
            </>
          ) : (
            <>
              <img src="/images/hen-embarrassed.svg" alt="" className="w-28 h-28 mx-auto animate-hen-pop" />
              <h2 className="font-headline text-4xl font-bold text-error tracking-tight">NO LUCK</h2>
              <p className="text-on-surface-variant font-body text-sm">
                {guesserName} ran out of guesses.
                {round.guessAttempts.length > 0 && (
                  <span className="block text-xs mt-1 opacity-75">
                    Last try: <span className="font-bold">{round.guesserAnswer}</span>
                  </span>
                )}
              </p>
            </>
          )}
        </div>

        {/* Secret Word */}
        <div className="bg-primary-fixed border-2 border-primary-fixed-dim rounded-2xl px-4 py-3 text-center shadow-sm">
          <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-primary-fixed-variant font-bold mb-0.5">
            The word was
          </p>
          <p className="font-headline text-3xl font-bold text-on-primary-fixed tracking-tight">
            {round.secretWord}
          </p>
        </div>

        {/* Clue debrief */}
        {round.clueGroups.length > 0 && (
          <div>
            <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary font-bold mb-2 px-1">
              What everyone wrote
            </h3>

            {/* Guesser rate-the-clues prompt */}
            {isCurrentGuesser && hasVisibleClues && (
              <div className="mb-3 bg-tertiary-container/40 border border-tertiary/30 rounded-xl px-4 py-3 text-center">
                <p className="text-xs font-bold text-on-tertiary-container uppercase tracking-wider font-label">
                  Rate the clues
                </p>
                <p className="text-[11px] text-outline mt-0.5 font-body">
                  {round.isCorrect
                    ? '👍 best clue (+pts split among authors) · 👎 worst clue (shame only)'
                    : '👎 shame the worst clue (or 👍 the best, no points this round)'}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              {round.clueGroups.map((group, idx) => {
                const isVisible = round.visibleGroupIndexes.includes(idx)
                const isYours = group.playerIds.includes(currentPlayerId ?? '')
                const displayText = Array.from(new Set(group.clueTexts.map((t) => t.trim()))).join(' / ')
                const names = group.playerIds.map((id) => players.find((p) => p.id === id)?.name ?? '?').join(', ')

                const groupFastWinners = group.playerIds.filter((pid) => fastBonusMap[pid])
                const yourId = currentPlayerId ?? ''
                const gotFastBonus = isYours && !!fastBonusMap[yourId] && group.playerIds.includes(yourId)
                const attemptPts = [10, 5, 2, 1][round.currentAttempt - 1] ?? 0

                const giverUpCount = Object.values(round.clueStarVotes ?? {}).filter((v) => v === idx).length
                const giverDownCount = Object.values(round.clueThumbsDownVotes ?? {}).filter((v) => v === idx).length
                const guesserUpPts = Math.floor(5 / group.playerIds.length)

                const isGuesserUpVoted = round.guesserStarVote === idx || pendingUpIdx === idx
                const isGuesserDownVoted = round.guesserThumbsDownVote === idx || pendingDownIdx === idx

                // Guesser can vote on visible clues
                const canGuesserVote = isCurrentGuesser && isVisible

                return (
                  <div
                    key={idx}
                    className={`px-4 py-2.5 rounded-xl border font-body transition-all ${
                      group.isDuplicate
                        ? 'bg-surface-container-low border-outline-variant/20 opacity-80'
                        : isGuesserUpVoted
                        ? 'bg-primary-fixed/30 border-primary/40 shadow-sm'
                        : isGuesserDownVoted
                        ? 'bg-error/10 border-error/30'
                        : isVisible && round.isCorrect
                        ? 'bg-primary-fixed/20 border-primary-fixed-dim'
                        : 'bg-surface-container-lowest border-outline-variant/30'
                    }`}
                  >
                    {/* Main row: word + badges */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className={`font-headline font-bold text-lg ${group.isDuplicate ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
                          {displayText}
                        </span>
                        <span className="text-xs text-outline mt-0.5">
                          {names}
                          {isYours && <span className="text-primary font-bold ml-1">← you</span>}
                        </span>
                      </div>
                      <div className="flex-shrink-0 flex flex-col items-end gap-1">
                        {group.isDuplicate ? (
                          <div className="text-[10px] text-error font-bold uppercase tracking-wider font-label">
                            🔄 Duplicate
                          </div>
                        ) : isVisible ? (
                          <div className="text-[10px] text-primary font-bold uppercase tracking-wider font-label">
                            ✅ Used
                          </div>
                        ) : null}
                        {groupFastWinners.length > 0 && (
                          <div className="text-[10px] text-tertiary font-bold uppercase tracking-wider font-label">
                            ⚡ +{fastBonusMap[groupFastWinners[0]]} fastest
                          </div>
                        )}
                        {/* Giver community votes */}
                        {(giverUpCount > 0 || giverDownCount > 0) && (
                          <div className="flex gap-2">
                            {giverUpCount > 0 && (
                              <span className="text-[11px] text-primary font-bold font-label">👍 {giverUpCount}</span>
                            )}
                            {giverDownCount > 0 && (
                              <span className="text-[11px] text-error font-bold font-label">👎 {giverDownCount}</span>
                            )}
                          </div>
                        )}
                        {/* Guesser 👍 awarded badge */}
                        {isGuesserUpVoted && (
                          <div className="flex items-center gap-1 bg-primary-fixed text-on-primary-fixed text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full font-label animate-hen-pop">
                            👍 +{guesserUpPts}
                          </div>
                        )}
                        {/* Guesser 👎 shame badge */}
                        {isGuesserDownVoted && !isGuesserUpVoted && (
                          <div className="flex items-center gap-1 bg-error-container text-error text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full font-label animate-hen-pop">
                            👎 shame
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Scoring badges for your own clue */}
                    {isYours && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {isVisible && round.isCorrect && (
                          <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full font-label">
                            +{attemptPts} used
                          </span>
                        )}
                        {gotFastBonus && (
                          <span className="bg-tertiary-container text-on-tertiary-container text-[10px] font-bold px-2 py-0.5 rounded-full font-label">
                            ⚡ +{fastBonusMap[yourId]} fastest
                          </span>
                        )}
                        {group.isDuplicate && (
                          <span className="bg-error/10 text-error text-[10px] font-bold px-2 py-0.5 rounded-full font-label">
                            -1 duplicate
                          </span>
                        )}
                      </div>
                    )}

                    {/* Guesser vote buttons — visible clues only */}
                    {canGuesserVote && !isYours && (
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={(e) => handleGuesserUp(idx, e)}
                          disabled={!round.isCorrect}
                          className={`flex-1 h-8 flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold font-label transition-all active:scale-[0.97] ${
                            isGuesserUpVoted
                              ? 'bg-primary-fixed text-on-primary-fixed shadow-sm'
                              : round.isCorrect
                              ? 'border-2 border-dashed border-primary/40 text-primary/70 hover:bg-primary-fixed/20'
                              : 'border border-outline-variant/20 text-outline/40 cursor-not-allowed'
                          }`}
                        >
                          👍 {round.isCorrect ? `+${guesserUpPts}` : ''}
                        </button>
                        <button
                          onClick={(e) => handleGuesserDown(idx, e)}
                          className={`flex-1 h-8 flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold font-label transition-all active:scale-[0.97] ${
                            isGuesserDownVoted
                              ? 'bg-error-container text-error shadow-sm'
                              : 'border-2 border-dashed border-error/30 text-error/60 hover:bg-error/10'
                          }`}
                        >
                          👎 shame
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Guesser result message */}
        {isCurrentGuesser && (
          <div className={`rounded-xl px-4 py-3 text-center font-body border ${round.isCorrect ? 'bg-primary-fixed/20 border-primary-fixed-dim' : 'bg-surface-container-low border-outline-variant/20'}`}>
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider font-label mb-1">Your result as guesser</p>
            <p className="font-headline font-bold text-lg text-on-surface">
              {round.isCorrect
                ? ([
                    '🎯 Got it on the first try!',
                    '✨ Second time\'s the charm!',
                    '💪 Persistence pays off!',
                    '🔓 Finally unlocked it!',
                  ][round.currentAttempt - 1] ?? '✅ Correct!')
                : round.clueGroups.length === 0
                ? '🤷 Nothing to work with!'
                : '😅 Better luck next time!'}
            </p>
            {round.isCorrect && (
              <p className="text-primary font-bold text-sm mt-1">+{[10, 5, 2, 1][round.currentAttempt - 1] ?? 0} points</p>
            )}
          </div>
        )}

        {/* Personal score */}
        {myPoints > 0 && (
          <div className="bg-primary text-on-primary rounded-2xl px-4 py-3 text-center shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
            <p className="font-label text-[10px] uppercase tracking-[0.2em] opacity-80 mb-0.5 font-bold">You earned</p>
            <p className="font-headline text-4xl font-bold tabular-nums">
              +{myPoints} <span className="text-2xl opacity-80">pts</span>
            </p>
          </div>
        )}

        {/* Standings */}
        <div>
          <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary font-bold mb-2 px-1">
            Standings
          </h3>
          <ul className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 divide-y divide-outline-variant/20 overflow-hidden">
            {sortedPlayers.map((p, i) => {
              const earned = round.pointsThisRound[p.id] ?? 0
              const isYou = p.id === currentPlayerId
              return (
                <li
                  key={p.id}
                  className={`px-3 py-2 flex items-center justify-between font-body ${isYou ? 'bg-secondary-fixed/20' : ''}`}
                >
                  <span className="flex items-center gap-2 font-medium text-on-surface">
                    <span className="text-outline w-5 tabular-nums">{i + 1}.</span>
                    {p.name}
                    {isYou && <span className="text-xs text-on-surface-variant">← you</span>}
                  </span>
                  <div className="flex items-center gap-3">
                    {earned > 0 && (
                      <span className="text-xs text-primary font-bold tabular-nums">+{earned}</span>
                    )}
                    <span className="font-headline text-lg font-bold tabular-nums text-on-surface">{p.score}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Action button */}
        {isHost ? (
          <button
            onClick={handleAdvance}
            disabled={advancing}
            className="w-full bg-primary text-on-primary h-14 rounded-xl font-body font-bold tracking-wide hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            {advancing ? 'Loading…' : isLastRound ? 'See final scores →' : 'Next round →'}
          </button>
        ) : (
          <p className="text-center text-outline text-sm animate-pulse font-body">
            Waiting on the host to deal the next round…
          </p>
        )}

        {error && <p className="text-center text-error text-sm font-body">{error}</p>}
      </div>
    </main>
  )
}
