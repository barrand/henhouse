import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useRoomId } from '@shared/useRoomId'
import { useAuth, useCurrentPlayer, useIsHost } from '../../../hooks/usePlayer'
import { useGame, useRound } from '../hooks/useGame'
import { setupPresence } from '../../../lib/presence'
import { getEligiblePlayers, isCurrentPlayerWaiting } from '@shared/roundEligibility'
import Lobby from '../components/Lobby'
import GameHeader from '../components/GameHeader'
import PrivacyHandoffView from '../components/PrivacyHandoffView'
import WordSelectionView from '../components/WordSelectionView'
import ClueSubmissionView from '../components/ClueSubmissionView'
import DeduplicationView from '../components/DeduplicationView'
import RevealView from '../components/RevealView'
import GuessView from '../components/GuessView'
import RoundResultView from '../components/RoundResultView'
import Scoreboard from '../components/Scoreboard'
import ScoringRound from '../components/ScoringRound'
import DebriefIntro from '../components/DebriefIntro'
import { usePresentationClock } from '@shared/presentationClock'
import { fowlReveal } from '@shared/revealTimeline'
import { FOWL_DEBRIEF_MS } from '../../../../functions/src/shared/sharedViewModel'

export default function Game() {
  const { code } = useParams<{ code: string }>()
  const { uid, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const { gameId, lookupError } = useRoomId(code, uid)
  const [completedHandoffKey, setCompletedHandoffKey] = useState<string | null>(null)

  const { game, players, loading: gameLoading } = useGame(gameId)
  const round = useRound(gameId, game?.status === 'playing' ? game.currentRound : null)
  const revealAt = round?.engine?.revealAt ?? round?.revealAt ?? 0
  const now = usePresentationClock(Boolean(revealAt), 80, revealAt + FOWL_DEBRIEF_MS + 750)
  const reveal = fowlReveal(revealAt, now)
  const scored = (round?.engine?.phase ?? round?.status) === 'scored'
  const before = round?.engine?.scoresBefore ?? round?.scoresBefore
  const displayPlayers = before && (!scored || !reveal.landed)
    ? players.map(player => ({ ...player, score: before[player.id] ?? player.score })) : players
  const currentPlayer = useCurrentPlayer(players, uid)
  const isHost = useIsHost(game?.hostId, uid)
  const eligiblePlayers = getEligiblePlayers(round, players)
  const isWaitingForNextRound = isCurrentPlayerWaiting(round, uid)

  useEffect(() => {
    if (gameId && uid) return setupPresence(gameId)
  }, [gameId, uid])

  // Auto-redirect on rematch
  useEffect(() => {
    if (game?.rematchCode) {
      navigate(`/fowl-words/${game.rematchCode}`)
    }
  }, [game?.rematchCode, navigate])

  // When host abandons the game, everyone goes home
  useEffect(() => {
    if (game?.status === 'abandoned') {
      navigate('/')
    }
  }, [game?.status, navigate])

  // Auto-redirect to home if game doesn't exist (refresh after game ended)
  useEffect(() => {
    if (lookupError) {
      const timer = setTimeout(() => navigate('/'), 500)
      return () => clearTimeout(timer)
    }
  }, [lookupError, navigate])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [game?.status, round?.status, isWaitingForNextRound, lookupError])

  if (!lookupError && (authLoading || gameLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface linen-texture">
        <p className="text-lg text-on-surface-variant font-body">Loading...</p>
      </div>
    )
  }

  if (lookupError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface linen-texture">
        <p className="text-lg text-error font-body">{lookupError}</p>
      </div>
    )
  }

  if (!game || !gameId) return null

  if (game.status === 'lobby') {
    return (
      <Lobby
        game={game}
        players={players}
        isHost={isHost}
        currentPlayer={currentPlayer}
      />
    )
  }

  if (game.status === 'finished') {
    return (
      <Scoreboard
        game={game}
        players={players}
        isHost={isHost}
        isFinal
      />
    )
  }

  if (game.status === 'abandoned') return null

  const isGuesser = game.currentGuesser === uid
  const guesserName = players.find(player => player.id === game.currentGuesser)?.name ?? 'The guesser'
  const intro = round && scored && !reveal.landed ? <DebriefIntro
    word={reveal.word ? (round.engine?.secretWord ?? round.secretWord) : ''}
    correct={round.engine?.correct ?? Boolean(round.isCorrect)}
    hasClues={(round.engine?.groups ?? round.clueGroups).length > 0}
    guesser={guesserName} fresh={reveal.wordFresh} /> : null
  const wordSelectionStartsAt = round?.wordSelectionStartsAt
    ? round.wordSelectionStartsAt.seconds * 1000 + Math.floor(round.wordSelectionStartsAt.nanoseconds / 1_000_000)
    : null
  const handoffKey = round && wordSelectionStartsAt ? `${round.id}:${wordSelectionStartsAt}` : null
  const isPrivacyHandoff = !!(
    round?.status === 'word-selection'
    && wordSelectionStartsAt
    && completedHandoffKey !== handoffKey
  )

  if (round && isWaitingForNextRound) {
    return (
      <div className="min-h-screen flex flex-col bg-surface linen-texture">
        <GameHeader game={game} players={displayPlayers} round={round} currentPlayer={currentPlayer} isHost={isHost} />
        <main className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="max-w-md text-center space-y-4">
            <img src="/images/generated-comic/midnight/hen-thinking.png" alt="" className="w-24 h-24 mx-auto animate-hen-bob" />
            <h2 className="font-headline text-3xl font-bold text-on-surface">You&apos;re in!</h2>
            <p className="text-on-surface-variant font-body">
              This round already started, so you&apos;ll join on the next one.
            </p>
          </div>
        </main>
      </div>
    )
  }

  if (round?.scoringVersion === 1) {
    return <div className="min-h-screen flex flex-col bg-surface linen-texture text-on-surface">
      <GameHeader game={game} players={displayPlayers} round={round} currentPlayer={currentPlayer} isHost={isHost} />
      {intro ?? (round.engine ? <ScoringRound game={game} view={round.engine} players={displayPlayers} uid={uid ?? ''} isHost={isHost} /> : <p className="p-6 text-center text-on-surface-variant">Loading this round…</p>)}
    </div>
  }

  if (round && isPrivacyHandoff) {
    return (
      <PrivacyHandoffView
        game={game}
        round={round}
        guesserName={guesserName}
        isHost={isHost}
        onComplete={() => setCompletedHandoffKey(handoffKey)}
      />
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface linen-texture">
      <GameHeader game={game} players={displayPlayers} round={round} currentPlayer={currentPlayer} isHost={isHost} />

      {(round?.status === 'word-selection' || round?.status === 'word-selected') && (
        <WordSelectionView
          game={game}
          round={round}
          players={eligiblePlayers}
          currentPlayerId={uid}
          isGuesser={isGuesser}
          isHost={isHost}
        />
      )}

      {round?.status === 'clue-submission' && (
        <ClueSubmissionView
          game={game}
          round={round}
          players={eligiblePlayers}
          currentPlayer={currentPlayer}
          isGuesser={isGuesser}
          isHost={isHost}
        />
      )}

      {round?.status === 'deduplication' && (
        <DeduplicationView round={round} isGuesser={isGuesser} />
      )}

      {round?.status === 'reveal' && (
        <RevealView
          game={game}
          round={round}
          players={eligiblePlayers}
          currentPlayer={currentPlayer}
          isGuesser={isGuesser}
          isHost={isHost}
        />
      )}

      {round?.status === 'guess' && (
        <GuessView
          game={game}
          round={round}
          players={eligiblePlayers}
          isGuesser={isGuesser}
          currentPlayerId={uid}
        />
      )}

      {round?.status === 'scored' && (intro ?? (
        <RoundResultView
          game={game}
          round={round}
          players={eligiblePlayers}
          isHost={isHost}
          currentPlayerId={uid}
        />
      ))}
    </div>
  )
}
