import { useState } from 'react'
import type { GameData, PlayerData, RoundData } from '../types'
import LeaderboardModal from './LeaderboardModal'
import RottenEgg from './RottenEgg'
import { flockAbandonGame } from '../service'

interface Props {
  game: GameData
  players: PlayerData[]
  currentPlayer: PlayerData | null
  round: RoundData | null
  isHost: boolean
}

export default function GameHeader({ game, players, currentPlayer, round: _round, isHost }: Props) {
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [abandoning, setAbandoning] = useState(false)

  const handleAbandon = async () => {
    setAbandoning(true)
    try {
      await flockAbandonGame(game.id)
    } catch {
      setAbandoning(false)
      setConfirming(false)
    }
  }

  return (
    <>
      <div className="sticky top-0 z-10 bg-primary-container text-on-primary-container px-4 py-2">
        <div className="flex justify-between items-center text-sm font-body">
          <span>Round {game.currentRound} of {game.settings.totalRounds}</span>
          <span className="font-bold">{game.code}</span>
        </div>

        {confirming ? (
          <div className="flex items-center justify-between mt-1 py-0.5">
            <span className="text-sm font-body opacity-90">End game for everyone?</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setConfirming(false)}
                className="text-sm font-body opacity-70 hover:opacity-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAbandon}
                disabled={abandoning}
                className="text-sm font-body font-bold bg-error text-on-error px-3 py-0.5 rounded-lg hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all"
              >
                {abandoning ? 'Ending…' : 'End game'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-center mt-1">
            <div className="flex items-center gap-2 font-body">
              <span className="flex items-center gap-1">
                <img src="/images/egg-icon.svg" alt="" className="w-4 h-4 inline-block" /> x {currentPlayer?.eggs ?? 0}
              </span>
              {game.rottenEggHolder === currentPlayer?.id && (
                <span className="flex items-center gap-1 bg-tertiary-container text-on-tertiary-container text-xs px-2 py-0.5 rounded-full font-bold">
                  <RottenEgg size={14} />
                  ROTTEN EGG
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {isHost && (
                <button
                  onClick={() => setConfirming(true)}
                  className="text-xs opacity-50 hover:opacity-80 font-body transition-opacity"
                >
                  End game
                </button>
              )}
              <button
                onClick={() => setShowLeaderboard(true)}
                className="text-sm underline opacity-80 hover:opacity-100 font-body"
              >
                Pecking Order
              </button>
            </div>
          </div>
        )}
      </div>

      {showLeaderboard && (
        <LeaderboardModal
          game={game}
          players={players}
          currentPlayerId={currentPlayer?.id ?? null}
          onClose={() => setShowLeaderboard(false)}
        />
      )}
    </>
  )
}
