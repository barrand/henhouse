import { useState } from 'react'

interface Props {
  onSubmit: (question: string) => void
  submittedQuestions: string[]
}

export default function QuestionSubmission({ onSubmit, submittedQuestions }: Props) {
  const [text, setText] = useState('')

  const handleSubmit = () => {
    if (!text.trim()) return
    onSubmit(text.trim())
    setText('')
  }

  return (
    <div>
      <h3 className="font-headline text-lg font-semibold text-primary mb-3 px-1">Submit a Question</h3>

      <div className="relative mb-3">
        <input
          type="text"
          placeholder="Type your own question..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          className="w-full bg-surface-container-lowest border-none rounded-xl py-4 pl-5 pr-14 shadow-[0_4px_12px_rgba(0,0,0,0.2)] focus:ring-1 focus:ring-primary/20 placeholder:text-on-surface-variant/40 text-sm italic font-headline"
          maxLength={200}
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="absolute right-2 top-2 bottom-2 w-10 bg-primary text-on-primary rounded-lg flex items-center justify-center hover:bg-primary-container disabled:opacity-50 transition-colors"
        >
          <span className="material-symbols-outlined">send</span>
        </button>
      </div>

      {submittedQuestions.length > 0 && (
        <div className="space-y-2">
          {submittedQuestions.map((q, i) => (
            <div key={i} className="px-4 py-3 bg-surface-container/50 rounded-lg border border-dashed border-outline-variant/30">
              <p className="font-headline italic text-on-surface-variant text-sm">"{q}"</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
