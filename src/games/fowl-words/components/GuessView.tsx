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
        <img src="/images/hen-thinking.svg" alt="" className="w-24 h-24 mx-auto animate-hen-bob" />
        <h2 className="font-headline text-2xl font-bold text-on-surface">
          Checking that guess…
        </h2>
        <div className="bg-surface-container-lowest rounded-2xl border-2 border-outline-variant/30 p-5 shadow-sm">
          <p className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary mb-2 font-bold">
            {isGuesser ? 'Your guess' : `${guesserPlayer?.name}’s guess`}
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
