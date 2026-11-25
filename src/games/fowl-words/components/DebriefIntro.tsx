interface Props {
  word: string
  correct: boolean
  hasClues: boolean
  guesser: string
  fresh: boolean
}

export default function DebriefIntro({ word, correct, hasClues, guesser, fresh }: Props) {
  const art = correct ? 'hen-winner' : hasClues ? 'hen-confused' : 'hen-embarrassed'
  return (
    <div className={`mx-auto max-w-xl px-5 py-10 text-center space-y-3 ${fresh ? 'animate-hen-pop' : ''}`}>
      <img src={`/images/generated-comic/midnight/${word ? art : 'hen-thinking'}.png`} alt="" className="size-28 mx-auto object-contain" />
      <h2 className="font-headline text-3xl font-bold">{word ? (correct ? `${guesser} got it!` : 'The word was') : 'Checking the result…'}</h2>
      {word && <p className="text-primary font-headline font-bold text-4xl wrap-anywhere">{word}</p>}
    </div>
  )
}
