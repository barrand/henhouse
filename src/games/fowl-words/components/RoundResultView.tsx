import { useState } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import { advanceRound } from '../service'

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
              <div className="text-6xl">🎉</div>
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
              <div className="text-6xl">😬</div>
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

        {/* Clue debrief — show all groups with names */}
        {round.clueGroups.length > 0 && (
          <div>
            <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary font-bold mb-2 px-1">
              What everyone wrote
            </h3>
            <div className="space-y-2">
              {round.clueGroups.map((group, idx) => {
                const scored = (round.pointsThisRound[group.playerIds[0]] ?? 0) > 0
                const isYours = group.playerIds.includes(currentPlayerId ?? '')
                const displayText = Array.from(new Set(group.clueTexts.map((t) => t.trim()))).join(' / ')
                const names = group.playerIds.map((id) => players.find((p) => p.id === id)?.name ?? '?').join(', ')

                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border font-body ${
                      group.isDuplicate
                        ? 'bg-surface-container-low border-outline-variant/20 opacity-75'
                        : scored
                        ? 'bg-primary-fixed/20 border-primary-fixed-dim'
                        : 'bg-surface-container-lowest border-outline-variant/30'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className={`font-headline font-bold text-lg ${group.isDuplicate ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
                        {displayText}
                      </span>
                      <span className="text-xs text-outline mt-0.5">
                        {names}
                        {isYours && <span className="text-primary font-bold ml-1">← you</span>}
                      </span>
                    </div>
                    <div className="ml-3 flex-shrink-0">
                      {group.isDuplicate ? (
                        <span className="text-[10px] text-error font-bold uppercase tracking-wider font-label">
                          Duped
                        </span>
                      ) : scored ? (
                        <span className="text-[10px] text-primary font-bold uppercase tracking-wider font-label">
                          ✓ Scored
                        </span>
                      ) : (
                        <span className="text-[10px] text-outline font-bold uppercase tracking-wider font-label">
                          Locked
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
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
