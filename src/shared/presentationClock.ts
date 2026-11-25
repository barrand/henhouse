import { useEffect, useState, useSyncExternalStore } from 'react'
import { onValue, ref } from 'firebase/database'
import { rtdb } from '../lib/firebase'

let offset = 0
let stop: (() => void) | undefined
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  stop ??= onValue(ref(rtdb, '.info/serverTimeOffset'), snapshot => {
    offset = Number(snapshot.val()) || 0
    for (const notify of listeners) notify()
  })
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      stop?.()
      stop = undefined
    }
  }
}

export function usePresentationClock(active: boolean, interval = 80, until?: number) {
  const skew = useSyncExternalStore(subscribe, () => offset)
  const [localNow, setLocalNow] = useState(Date.now)
  useEffect(() => {
    if (!active) return
    const update = () => {
      const now = Date.now()
      setLocalNow(now)
      if (until && now + offset >= until) window.clearInterval(timer)
    }
    const timer = window.setInterval(update, interval)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [active, interval, until])
  return localNow + skew
}
