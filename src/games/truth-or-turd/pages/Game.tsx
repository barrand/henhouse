import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebase'
import { useAuth, useCurrentPlayer, useIsHost } from '../../../hooks/usePlayer'
import { setupPresence } from '../../../lib/presence'
import { getEligiblePlayers, isCurrentPlayerWaiting } from '@shared/roundEligibility'
import { useGame, useRound } from '../hooks/useGame'
import Lobby from '../components/Lobby'
import GameHeader from '../components/GameHeader'
import AnsweringView from '../components/AnsweringView'
import RevealView from '../components/RevealView'
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
  const eligiblePlayers = getEligiblePlayers(round, players)
  const isWaitingForNextRound = isCurrentPlayerWaiting(round, uid)

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
    if (gameId && uid) setupPresence(gameId)
  }, [gameId, uid])

  useEffect(() => {
    if (game?.rematchCode) {
      navigate(`/truth-or-turd/${game.rematchCode}`)
    }
  }, [game?.rematchCode, navigate])

  useEffect(() => {
    if (game?.status === 'abandoned') navigate('/')
  }, [game?.status, navigate])

  useEffect(() => {
    if (lookupError) {
      const timer = setTimeout(() => navigate('/'), 500)
      return () => clearTimeout(timer)
    }
  }, [lookupError, navigate])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [game?.status, round?.status, isWaitingForNextRound, lookupError])

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
        currentPlayerId={uid}
        isFinal
      />
    )
  }

  if (game.status === 'abandoned') return null

  if (round && isWaitingForNextRound) {
    return (
      <div className="min-h-screen flex flex-col bg-surface linen-texture">
        <GameHeader game={game} players={players} currentPlayer={currentPlayer} round={round} isHost={isHost} />
        <main className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="max-w-md text-center space-y-4">
            <img src="/images/generated-comic/hen-thinking.png" alt="" className="w-24 h-24 mx-auto animate-hen-bob" />
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
      <GameHeader game={game} players={players} currentPlayer={currentPlayer} round={round} isHost={isHost} />

      {round?.status === 'answering' && (
        <AnsweringView
          game={game}
          round={round}
          players={eligiblePlayers}
          isHost={isHost}
          currentPlayerId={uid}
        />
      )}

      {(round?.status === 'revealing' || round?.status === 'revealed') && (
        <RevealView
          game={game}
          round={round}
          players={eligiblePlayers}
          isHost={isHost}
          currentPlayerId={uid}
        />
      )}
    </div>
  )
}
