import { useEffect, useState } from 'react'

export function useDisplaySize() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  useEffect(() => {
    const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  return size
}

export function paginate<T>(items: T[], capacity: number, weight: (item: T) => number): T[][] {
  const pages: T[][] = [[]]
  let used = 0
  for (const item of items) {
    const cost = Math.min(capacity, weight(item))
    if (used + cost > capacity) {
      pages.push([])
      used = 0
    }
    pages[pages.length - 1].push(item)
    used += cost
  }
  return pages
}
