import type { RoundData } from '../types'

interface Props {
  round: RoundData
  isGuesser: boolean
}

export default function DeduplicationView({ isGuesser }: Props) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-10">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-6xl animate-pulse">🔍</div>
        <h2 className="font-headline text-2xl font-bold text-on-surface">
          {isGuesser ? 'Still eyes closed...' : 'Checking for duplicates...'}
        </h2>
        <p className="text-on-surface-variant font-body">
          {isGuesser
            ? 'The others are sorting out their clues.'
            : 'Comparing everyone\'s clues to find matches.'}
        </p>
        <div className="flex justify-center gap-2">
          <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
          <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
          <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
        </div>
      </div>
    </main>
  )
}
