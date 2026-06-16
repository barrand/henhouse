import type { RoundData } from '../types'

interface Props {
  round: RoundData
  isGuesser: boolean
}

export default function DeduplicationView({ isGuesser }: Props) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-10">
      <div className="max-w-md w-full text-center space-y-6">
        <img src="/images/hen-magnifying.svg" alt="" className="w-24 h-24 mx-auto animate-hen-bob" />
        <h2 className="font-headline text-2xl font-bold text-on-surface">
          {isGuesser ? 'Almost ready…' : 'Sorting clues…'}
        </h2>
        <p className="text-on-surface-variant font-body">
          {isGuesser
            ? 'The flock is finalizing what you get to see.'
            : 'Hunting for matching clues. Survivors will reach the guesser.'}
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
