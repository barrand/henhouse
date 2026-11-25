import { useLayoutEffect, useRef, type RefObject } from 'react'

export function useRankMotion(root: RefObject<HTMLElement | null>, order: string) {
  const previous = useRef(new Map<string, DOMRect>())
  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const row of root.current?.querySelectorAll<HTMLElement>('[data-ranking]') ?? []) {
      const key = row.dataset.ranking ?? ''
      const rect = row.getBoundingClientRect()
      const before = previous.current.get(key)
      next.set(key, rect)
      if (!before || reduced || typeof row.animate !== 'function') continue
      const x = before.left - rect.left
      const y = before.top - rect.top
      if (x || y) row.animate([{ translate: x + 'px ' + y + 'px' }, { translate: '0 0' }], { duration: 260, easing: 'ease-out' })
    }
    previous.current = next
  }, [root, order])
}
