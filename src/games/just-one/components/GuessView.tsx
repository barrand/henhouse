import type { GameData, PlayerData, RoundData } from '../types'

interface Props {
  game: GameData
  round: RoundData
  players: PlayerData[]
  isGuesser: boolean
  currentPlayerId: string | null
}

export default function GuessView({ game, round, players, isGuesser }: Props) {
  const guesserPlayer = players.find((p) => p.id === game.currentGuesser)
  const guess = round.guessAttempts[round.guessAttempts.length - 1] ?? '...'

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-10">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-6xl animate-pulse">🤔</div>
        <h2 className="font-headline text-2xl font-bold text-on-surface">
          Checking the guess...
        </h2>
        <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/15">
          <p className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary mb-2">
            {isGuesser ? 'You guessed' : `${guesserPlayer?.name} guessed`}
          </p>
          <p className="font-headline text-3xl font-bold text-on-surface">
            {guess}
          </p>
        </div>
        <div className="flex justify-center gap-2">
          <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
          <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
          <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
        </div>
      </div>
    </main>
  )
}
