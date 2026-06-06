import { useState } from 'react'

interface Props {
  categories: string[]
  editable: boolean
  onAdd: (category: string) => void
  onRemove: (category: string) => void
}

export default function CategoryInput({ categories, editable, onAdd, onRemove }: Props) {
  const [text, setText] = useState('')

  const handleAdd = () => {
    const trimmed = text.trim()
    if (!trimmed || categories.includes(trimmed)) return
    onAdd(trimmed)
    setText('')
  }

  return (
    <div>
      <h3 className="font-headline text-lg font-semibold text-primary mb-1 px-1">Bonus Categories</h3>
      {editable && (
        <p className="text-xs text-on-surface-variant mb-4 px-1">Adds themed questions on top of the general pool</p>
      )}

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {categories.map((cat) => (
            <div
              key={cat}
              className="inline-flex items-center gap-2 bg-secondary-fixed px-3 py-1.5 rounded-full border border-secondary-container"
            >
              <span className="text-sm font-medium text-on-secondary-fixed">{cat}</span>
              {editable && (
                <button
                  onClick={() => onRemove(cat)}
                  className="text-on-secondary-fixed-variant hover:text-on-secondary-fixed transition-colors"
                >
                  <span className="material-symbols-outlined text-sm leading-none">close</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editable && (
        <div className="relative">
          <input
            type="text"
            placeholder="Add custom category..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="w-full bg-surface-container-lowest border-none rounded-xl py-4 pl-5 pr-14 shadow-[0_4px_12px_rgba(0,0,0,0.2)] focus:ring-1 focus:ring-primary/20 placeholder:text-on-surface-variant/40 text-sm"
            maxLength={30}
          />
          <button
            onClick={handleAdd}
            disabled={!text.trim()}
            className="absolute right-2 top-2 bottom-2 w-10 bg-primary text-on-primary rounded-lg flex items-center justify-center hover:bg-primary-container disabled:opacity-50 transition-colors"
          >
            <span className="material-symbols-outlined">add</span>
          </button>
        </div>
      )}

      {!editable && categories.length === 0 && (
        <p className="text-xs text-on-surface-variant italic px-1">No bonus categories</p>
      )}
    </div>
  )
}
