import { useState, useEffect } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import { advanceRound, submitGuesserStarVote, submitGuesserThumbsDownVote } from '../service'
import { playThumbVoteFx } from './thumbVoteFx'
import {
  GiverNodCell,
  GuesserMvpCell,
  ShameCell,
  StarIcon,
  guesserResultVoteHint,
} from './clueVoteUi'

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
    playThumbVoteFx(e.currentTarget, 'up')
    if (!round.isCorrect) return
    const current =
      pendingUpIdx !== null ? pendingUpIdx : round.guesserStarVote ?? null
    setPendingUpIdx(current === idx ? null : idx)
    submitGuesserStarVote(game.id, game.currentRound, idx).catch(() => {})
  }

  const handleGuesserDown = (idx: number, e: React.MouseEvent<HTMLButtonElement>) => {
    playThumbVoteFx(e.currentTarget, 'down')
    const current =
      pendingDownIdx !== null ? pendingDownIdx : round.guesserThumbsDownVote ?? null
    setPendingDownIdx(current === idx ? null : idx)
    submitGuesserThumbsDownVote(game.id, game.currentRound, idx).catch(() => {})
  }

  // Single active star/shame — pending overrides server until Firestore confirms.
  const activeStarIdx =
    pendingUpIdx !== null ? pendingUpIdx : round.guesserStarVote ?? null
  const activeShameIdx =
    pendingDownIdx !== null ? pendingDownIdx : round.guesserThumbsDownVote ?? null

  useEffect(() => {
    if (pendingUpIdx !== null && round.guesserStarVote === pendingUpIdx) {
      setPendingUpIdx(null)
    }
  }, [round.guesserStarVote, pendingUpIdx])

  useEffect(() => {
    if (pendingDownIdx !== null && round.guesserThumbsDownVote === pendingDownIdx) {
      setPendingDownIdx(null)
    }
  }, [round.guesserThumbsDownVote, pendingDownIdx])

  const hasVisibleClues = round.clueGroups.some((_, i) => round.visibleGroupIndexes.includes(i))
  const visibleSet = new Set(round.visibleGroupIndexes)
  const clueGroupDisplayOrder = [
    ...round.clueGroups.map((_, i) => i).filter((i) => visibleSet.has(i)),
    ...round.clueGroups.map((_, i) => i).filter((i) => !visibleSet.has(i)),
  ]
  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? '?'

  const renderAuthorNames = (playerIds: string[], isYours: boolean) => {
    if (playerIds.length === 1) {
      return isYours && playerIds[0] === currentPlayerId
        ? <span className="text-primary font-bold">← you</span>
        : playerName(playerIds[0])
    }
    return playerIds.map((id, i) => (
      <span key={id}>
        {i > 0 && ', '}
        {id === currentPlayerId ? (
          <span className="text-primary font-bold">← you</span>
        ) : (
          playerName(id)
        )}
      </span>
    ))
  }

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
                <p className="text-[11px] text-on-surface-variant mt-0.5 font-body">
                  {guesserResultVoteHint(!!round.isCorrect)}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {clueGroupDisplayOrder.map((idx) => {
                const group = round.clueGroups[idx]
                const isVisible = visibleSet.has(idx)
                const isYours = group.playerIds.includes(currentPlayerId ?? '')
                const displayText = group.clueTexts[0]?.trim() || '—'

                const yourId = currentPlayerId ?? ''
                const gotFastBonus = isYours && !!fastBonusMap[yourId] && group.playerIds.includes(yourId)
                const attemptPts = [10, 5, 2, 1][round.currentAttempt - 1] ?? 0

                const giverUpCount = Object.values(round.clueStarVotes ?? {}).filter((v) => v === idx).length
                const giverDownCount = Object.values(round.clueThumbsDownVotes ?? {}).filter((v) => v === idx).length
                const guesserUpPts = Math.floor(5 / group.playerIds.length)

                const isGuesserUpVoted = activeStarIdx === idx
                const isGuesserDownVoted = activeShameIdx === idx
                const canGuesserVote = isCurrentGuesser && isVisible && !isYours
                const canGuesserStarUp = canGuesserVote && round.isCorrect

                return (
                  <div
                    key={idx}
                    className={`relative bg-surface-container-lowest rounded-xl border-2 shadow-sm px-2.5 py-1.5 transition-all ${
                      group.isDuplicate && !isVisible
                        ? 'bg-surface-container-low border-outline-variant/50'
                        : isGuesserUpVoted
                        ? 'border-primary/70 bg-primary/5'
                        : isGuesserDownVoted
                        ? 'border-error/60 bg-error/5'
                        : isVisible && round.isCorrect
                        ? 'border-primary/40'
                        : 'border-outline-variant/60'
                    }`}
                  >
                    <p
                      className={`font-headline font-bold text-xl leading-tight text-center line-clamp-2 h-11 flex items-center justify-center mb-0.5 ${
                        group.isDuplicate && !isVisible
                          ? 'text-error line-through'
                          : 'text-on-surface'
                      }`}
                    >
                      {displayText}
                    </p>
                    <p className="text-xs text-on-surface-variant font-medium mb-1 font-body text-center leading-snug h-4 truncate">
                      {renderAuthorNames(group.playerIds, isYours)}
                      {group.isDuplicate && isYours && (
                        <span className="text-error font-bold"> · -1</span>
                      )}
                      {group.isDuplicate && !isYours && (
                        <span className="text-error font-bold uppercase text-[9px] tracking-wide"> · dup</span>
                      )}
                    </p>

                    {((isVisible && round.isCorrect && isYours) || gotFastBonus) && (
                      <div className="mb-1 flex items-center justify-center gap-1 overflow-hidden">
                        {isVisible && round.isCorrect && isYours && (
                          <span className="bg-primary-fixed text-on-primary-fixed text-[10px] font-bold px-2 py-0.5 rounded-full font-label whitespace-nowrap">
                            +{attemptPts} used
                          </span>
                        )}
                        {gotFastBonus && (
                          <span className="bg-tertiary-container text-on-tertiary-container text-[10px] font-bold px-2 py-0.5 rounded-full font-label whitespace-nowrap">
                            ⚡ +{fastBonusMap[yourId]} fastest
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex gap-1.5">
                      {round.isCorrect ? (
                        <>
                          <GiverNodCell count={giverUpCount} />
                          {canGuesserVote && canGuesserStarUp ? (
                            <button
                              onClick={(e) => handleGuesserUp(idx, e)}
                              title={`Award +5 MVP${group.playerIds.length > 1 ? ` (+${guesserUpPts} each)` : ''}`}
                              className={`flex-1 h-9 flex flex-col items-center justify-center gap-0 rounded-lg font-label shrink-0 transition-all active:scale-[0.97] ${
                                isGuesserUpVoted
                                  ? 'bg-primary-fixed shadow-sm'
                                  : 'bg-surface-container-low'
                              }`}
                            >
                              <StarIcon
                                filled={isGuesserUpVoted}
                                className={isGuesserUpVoted ? 'text-on-primary-fixed' : 'text-primary opacity-50'}
                              />
                              {isGuesserUpVoted && (
                                <span className="text-[9px] font-bold leading-none text-on-primary-fixed">
                                  +5
                                </span>
                              )}
                            </button>
                          ) : (
                            <GuesserMvpCell
                              active={isGuesserUpVoted}
                              perAuthor={guesserUpPts}
                              authorCount={group.playerIds.length}
                            />
                          )}
                          <ShameCell
                            giverCount={giverDownCount}
                            guesserShamed={isGuesserDownVoted}
                            interactive={canGuesserVote}
                            isActive={isGuesserDownVoted}
                            onClick={canGuesserVote ? (e) => handleGuesserDown(idx, e) : undefined}
                          />
                        </>
                      ) : canGuesserVote ? (
                        <>
                          <GiverNodCell count={giverUpCount} />
                          <ShameCell
                            giverCount={giverDownCount}
                            guesserShamed={isGuesserDownVoted}
                            interactive
                            wide
                            isActive={isGuesserDownVoted}
                            onClick={(e) => handleGuesserDown(idx, e)}
                          />
                        </>
                      ) : (
                        <>
                          <GiverNodCell count={giverUpCount} />
                          <GuesserMvpCell active={false} perAuthor={0} authorCount={1} />
                          <ShameCell
                            giverCount={giverDownCount}
                            guesserShamed={isGuesserDownVoted}
                          />
                        </>
                      )}
                    </div>
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
