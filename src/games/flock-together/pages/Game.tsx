import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useRoomId } from '@shared/useRoomId'
import { useAuth, useCurrentPlayer, useIsHost } from '../../../hooks/usePlayer'
import { useGame, useRound } from '../hooks/useGame'
import { setupPresence } from '../../../lib/presence'
import { getEligiblePlayers, isCurrentPlayerWaiting } from '@shared/roundEligibility'
import Lobby from '../components/Lobby'
import GameHeader from '../components/GameHeader'
import QuestionDisplay from '../components/QuestionDisplay'
import RevealBoard from '../components/RevealBoard'
import Scoreboard from '../components/Scoreboard'
import { forceEndRound } from '../service'
import { usePresentationClock } from '@shared/presentationClock'
import { FLOCK_REVEAL_MS } from '../../../../functions/src/shared/sharedViewModel'

export default function Game() {
  const { code } = useParams<{ code: string }>()
  const { uid, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const { gameId, lookupError } = useRoomId(code, uid)

  const { game, players, loading: gameLoading } = useGame(gameId)
  const round = useRound(gameId, game?.status === 'playing' ? game.currentRound : null)
  const now = usePresentationClock(Boolean(round?.revealAt), 80, round?.revealAt && round.revealAt + FLOCK_REVEAL_MS + 750)
  const landed = round?.status === 'scored' && (!round.revealAt || now >= round.revealAt + FLOCK_REVEAL_MS)
  const scores = landed ? round.scoresAfter : round?.scoresBefore
  const displayPlayers = scores ? players.map(player => ({ ...player, score: scores[player.id] ?? player.score })) : players
  const currentPlayer = useCurrentPlayer(displayPlayers, uid)
  const isHost = useIsHost(game?.hostId, uid)
  const eligiblePlayers = getEligiblePlayers(round, players)
  const displayEligible = getEligiblePlayers(round, displayPlayers)
  const isWaitingForNextRound = isCurrentPlayerWaiting(round, uid)
  useEffect(() => {
    if (!gameId || !isHost || game?.aiExperiment?.mode !== 'jev' || round?.status !== 'revealing') return
    const timer = setInterval(() => { void forceEndRound(gameId).catch(() => {}) }, 3000)
    return () => clearInterval(timer)
  }, [gameId, isHost, game?.aiExperiment?.mode, round?.status])

  useEffect(() => {
    if (gameId && uid) return setupPresence(gameId)
  }, [gameId, uid])

  // When host starts a rematch, everyone auto-redirects to the new game
  useEffect(() => {
    if (game?.rematchCode) {
      navigate(`/game/${game.rematchCode}`)
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
        currentPlayerId={currentPlayer?.id ?? null}
      />
    )
  }

  if (game.status === 'abandoned') return null

  if (round && isWaitingForNextRound) {
    return (
      <div className="min-h-screen flex flex-col bg-surface linen-texture">
        <GameHeader
          game={game}
          players={displayPlayers}
          currentPlayer={currentPlayer}
          round={round}
          isHost={isHost}
        />
        <main className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="max-w-md text-center space-y-4">
            <img src="/images/generated-comic/midnight/hen-thinking.png" alt="" className="w-24 h-24 mx-auto animate-hen-bob" />
            <h2 className="font-headline text-3xl font-bold text-on-surface">You&apos;re in!</h2>
            <p className="text-on-surface-variant font-body">
              This question already started, so you&apos;ll join on the next one.
            </p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface linen-texture">
      <GameHeader
        game={game}
        players={displayPlayers}
        currentPlayer={currentPlayer}
        round={round}
        isHost={isHost}
      />

      {round?.status === 'answering' && (
        <QuestionDisplay
          key={round.questionInstance ?? round.deadline.seconds}
          game={game}
          round={round}
          isHost={isHost}
          players={eligiblePlayers}
          currentPlayerId={uid}
        />
      )}

      {(round?.status === 'revealing' || round?.status === 'scored') && (
        <RevealBoard
          key={`${game.id}:${round.id}:${round.questionInstance ?? ''}`}
          game={game}
          round={round}
          players={displayEligible}
          isHost={isHost}
          currentPlayerId={uid}
          now={now}
        />
      )}
    </div>
  )
}
