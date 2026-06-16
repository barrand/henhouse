import { useState } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import { advanceRound, submitGuesserStarVote } from '../service'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  isHost: boolean
  currentPlayerId: string | null
}

export default function RoundResultView({ game, round, players, isHost, currentPlayerId }: Props) {
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState('')

  const guesserPlayer = players.find((p) => p.id === game.currentGuesser)
  const isLastRound = game.currentRound >= game.settings.totalRounds

  const handleAdvance = async () => {
    setError('')
    setAdvancing(true)
    try {
      await advanceRound(game.id)
    } catch (err: any) {
      setError(err.message ?? 'Couldn’t move on')
      setAdvancing(false)
    }
  }

  const myPoints = currentPlayerId ? round.pointsThisRound[currentPlayerId] ?? 0 : 0
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)
  const guesserName = guesserPlayer?.name ?? 'The guesser'

  return (
    <main className="flex-1 flex flex-col px-4 py-6">
      <div className="max-w-md w-full mx-auto space-y-5">
        {/* Result Banner */}
        <div className="text-center space-y-2">
          {round.isCorrect ? (
            <>
              <img
                src={round.currentAttempt === 1 ? '/images/hen-excited.svg' : '/images/hen-winner.svg'}
                alt=""
                className={`w-24 h-24 mx-auto ${round.currentAttempt === 1 ? 'animate-hen-celebrate' : 'animate-hen-pop'}`}
              />
              <h2 className="font-headline text-4xl font-bold text-primary tracking-tight">
                NAILED IT!
              </h2>
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
          ) : (
            <>
              <img src="/images/hen-embarrassed.svg" alt="" className="w-24 h-24 mx-auto animate-hen-pop" />
              <h2 className="font-headline text-4xl font-bold text-error tracking-tight">
                NO LUCK
              </h2>
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

        {/* Secret Word — Flock-style premium card */}
        <div className="bg-primary-fixed/50 border-2 border-primary-fixed-dim rounded-2xl p-5 text-center shadow-sm">
          <p className="font-label text-[10px] uppercase tracking-[0.2em] text-primary font-bold mb-1">
            The word was
          </p>
          <p className="font-headline text-4xl font-bold text-on-surface tracking-tight">
            {round.secretWord}
          </p>
        </div>

        {/* Clue debrief — show all groups with scoring breakdown */}
        {round.clueGroups.length > 0 && (
          <div>
            <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary font-bold mb-2 px-1">
              What everyone wrote
            </h3>

            {/* Guesser star prompt — only after correct round, before they've voted */}
            {currentPlayerId === game.currentGuesser && round.isCorrect && round.guesserStarVote == null && (
              <div className="mb-3 bg-tertiary-container/40 border border-tertiary/30 rounded-xl px-4 py-3 text-center">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider font-label">
                  ⭐ Tip your hat to the best clue
                </p>
                <p className="text-[11px] text-outline mt-0.5 font-body">Tap a clue below — worth +5 pts to that player</p>
              </div>
            )}

            <div className="space-y-2">
              {round.clueGroups.map((group, idx) => {
                const isVisible = round.visibleGroupIndexes.includes(idx)
                const isYours = group.playerIds.includes(currentPlayerId ?? '')
                const displayText = Array.from(new Set(group.clueTexts.map((t) => t.trim()))).join(' / ')
                const names = group.playerIds.map((id) => players.find((p) => p.id === id)?.name ?? '?').join(', ')

                // Determine per-player breakdown for "yours" row
                const yourId = currentPlayerId ?? ''
                const yourPoints = round.pointsThisRound[yourId] ?? 0
                const attemptPts = [10, 5, 2, 1][round.currentAttempt - 1] ?? 0
                const gotFastBonus = isYours && isVisible && round.isCorrect && (
                  group.isDuplicate ? yourPoints === attemptPts - 1 + 2 : yourPoints === attemptPts + 2
                )

                // Star counts
                const giverStarCount = Object.values(round.clueStarVotes ?? {}).filter((v) => v === idx).length
                const isGuesserStarred = round.guesserStarVote === idx

                // Is this a tappable guesser star target?
                const canGuesserStar = currentPlayerId === game.currentGuesser
                  && round.isCorrect
                  && round.guesserStarVote == null
                  && isVisible

                return (
                  <div
                    key={idx}
                    onClick={canGuesserStar ? () => submitGuesserStarVote(game.id, game.currentRound, idx).catch(() => {}) : undefined}
                    className={`px-4 py-3 rounded-xl border font-body transition-all ${
                      group.isDuplicate
                        ? 'bg-surface-container-low border-outline-variant/20 opacity-80'
                        : isGuesserStarred
                        ? 'bg-tertiary-container/40 border-tertiary/50'
                        : isVisible && round.isCorrect
                        ? 'bg-primary-fixed/20 border-primary-fixed-dim'
                        : 'bg-surface-container-lowest border-outline-variant/30'
                    } ${canGuesserStar ? 'cursor-pointer active:scale-[0.98] hover:border-tertiary/50' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className={`font-headline font-bold text-lg ${group.isDuplicate ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
                          {displayText}
                        </span>
                        <span className="text-xs text-outline mt-0.5">
                          {names}
                          {isYours && <span className="text-primary font-bold ml-1">← you</span>}
                        </span>
                      </div>
                      <div className="ml-3 flex-shrink-0 text-right space-y-1">
                        {group.isDuplicate ? (
                          <div className="text-[10px] text-error font-bold uppercase tracking-wider font-label">
                            🔄 Duplicate
                          </div>
                        ) : isVisible && round.isCorrect ? (
                          <div className="text-[10px] text-primary font-bold uppercase tracking-wider font-label">
                            ✅ Used
                          </div>
                        ) : (
                          <div className="text-[10px] text-outline font-bold uppercase tracking-wider font-label">
                            🔒 Locked
                          </div>
                        )}
                        {/* Star counts */}
                        {giverStarCount > 0 && (
                          <div className="text-[11px] text-on-surface-variant font-bold font-label">
                            ⭐ {giverStarCount}
                          </div>
                        )}
                        {isGuesserStarred && (
                          <div className="text-[10px] text-tertiary font-bold uppercase tracking-wider font-label">
                            🌟 +5 guesser
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Scoring badges for this player's own clue */}
                    {isYours && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {isVisible && round.isCorrect && (
                          <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full font-label">
                            +{attemptPts} used
                          </span>
                        )}
                        {gotFastBonus && (
                          <span className="bg-tertiary-container text-on-tertiary-container text-[10px] font-bold px-2 py-0.5 rounded-full font-label">
                            ⚡ +2 fastest
                          </span>
                        )}
                        {group.isDuplicate && (
                          <span className="bg-error/10 text-error text-[10px] font-bold px-2 py-0.5 rounded-full font-label">
                            -1 duplicate
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Guesser result message */}
        {currentPlayerId === game.currentGuesser && (
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
                : '😅 The word remains a mystery…'}
            </p>
            {round.isCorrect && (
              <p className="text-primary font-bold text-sm mt-1">+{[10, 5, 2, 1][round.currentAttempt - 1] ?? 0} points</p>
            )}
          </div>
        )}

        {/* Personal score — only if you scored */}
        {myPoints > 0 && (
          <div className="bg-primary text-on-primary rounded-2xl p-5 text-center shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
            <p className="font-label text-[10px] uppercase tracking-[0.2em] opacity-80 mb-1 font-bold">
              You earned
            </p>
            <p className="font-headline text-5xl font-bold tabular-nums">
              +{myPoints} <span className="text-3xl opacity-80">pts</span>
            </p>
          </div>
        )}

        {/* Updated scoreboard */}
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
                  className={`px-4 py-3 flex items-center justify-between font-body ${
                    isYou ? 'bg-secondary-fixed/20' : ''
                  }`}
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
                    <span className="font-headline text-lg font-bold tabular-nums text-on-surface">
                      {p.score}
                    </span>
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
