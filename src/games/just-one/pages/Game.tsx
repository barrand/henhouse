import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebase'
import { useAuth, useCurrentPlayer, useIsHost } from '../../../hooks/usePlayer'
import { useGame, useRound } from '../hooks/useGame'
import { setupPresence } from '../../../lib/presence'
import Lobby from '../components/Lobby'
import GameHeader from '../components/GameHeader'
import ClueSubmissionView from '../components/ClueSubmissionView'
import DeduplicationView from '../components/DeduplicationView'
import RevealView from '../components/RevealView'
import GuessView from '../components/GuessView'
import RoundResultView from '../components/RoundResultView'
import Scoreboard from '../components/Scoreboard'

export default function Game() {
  const { code } = useParams<{ code: string }>()
  const { uid, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [gameId, setGameId] = useState<string | null>(null)
  const [lookupError, setLookupError] = useState('')

  const { game, players, loading: gameLoading } = useGame(gameId)
  const round = useRound(gameId, game?.currentRound ?? null)
  const currentPlayer = useCurrentPlayer(players, uid)
  const isHost = useIsHost(game?.hostId, uid)

  useEffect(() => {
    if (!code) return
    const upperCode = code.toUpperCase()

    async function lookupGame() {
      const roomRef = doc(db, 'rooms', upperCode)
      const roomSnap = await getDoc(roomRef)
      if (roomSnap.exists() && roomSnap.data().active) {
        setGameId(roomSnap.data().gameId)
      } else {
        setLookupError('Room not found')
      }
    }
    lookupGame()
  }, [code])

  useEffect(() => {
    if (gameId && uid) {
      setupPresence(gameId)
    }
  }, [gameId, uid])

  // Auto-redirect on rematch
  useEffect(() => {
    if (game?.rematchCode) {
      navigate(`/just-one/${game.rematchCode}`)
    }
  }, [game?.rematchCode, navigate])

  if (authLoading || gameLoading) {
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

  const isGuesser = game.currentGuesser === uid

  return (
    <div className="min-h-screen flex flex-col bg-surface linen-texture">
      <GameHeader game={game} players={players} round={round} />

      {round?.status === 'clue-submission' && (
        <ClueSubmissionView
          game={game}
          round={round}
          players={players}
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
          players={players}
          currentPlayer={currentPlayer}
          isGuesser={isGuesser}
        />
      )}

      {round?.status === 'guess' && (
        <GuessView
          game={game}
          round={round}
          players={players}
          isGuesser={isGuesser}
          currentPlayerId={uid}
        />
      )}

      {round?.status === 'scored' && (
        <RoundResultView
          game={game}
          round={round}
          players={players}
          isHost={isHost}
          currentPlayerId={uid}
        />
      )}
    </div>
  )
}
