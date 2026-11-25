import { useEffect, useState, type ReactNode } from 'react'

export function DisplayPager<T extends { id: string }>({ pages, label, ready, auto, children }: {
  pages: T[][]
  label: string
  ready: boolean
  auto: boolean
  children: (items: T[]) => ReactNode
}) {
  const [anchor, setAnchor] = useState('')
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReduced(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])

  const page = Math.max(0, pages.findIndex(items => items.some(item => item.id === anchor)))
  const count = pages.length
  const current = pages[page] ?? []
  const next = pages[(page + 1) % count]?.[0]?.id
  const previous = pages[(page - 1 + count) % count]?.[0]?.id
  const delay = Math.max(5500, current.length * 700)
  const cycling = auto && !reduced

  useEffect(() => {
    if (!ready || !cycling || paused || count < 2 || !next) return
    const timer = window.setTimeout(() => setAnchor(next), delay)
    return () => window.clearTimeout(timer)
  }, [ready, cycling, paused, count, next, delay])

  function go(id: string | undefined) {
    if (id) setAnchor(id)
    setPaused(true)
  }

  return (
    <>
      {children(current)}
      {ready && count > 1 && (
        <nav className="display-page-controls" aria-label={label + ' pages'}>
          <span className="font-mono text-on-surface-variant">{label} {page + 1} / {count}</span>
          <button type="button" onClick={() => go(previous)} aria-label={'Previous ' + label.toLowerCase() + ' page'}>Previous</button>
          <button type="button" onClick={() => go(next)} aria-label={'Next ' + label.toLowerCase() + ' page'}>Next</button>
          {cycling && <button type="button" onClick={() => setPaused(value => !value)}>{paused ? 'Resume pages' : 'Pause pages'}</button>}
        </nav>
      )}
    </>
  )
}
