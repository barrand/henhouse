import {
  onSnapshot,
  type DocumentReference,
  type DocumentSnapshot,
  type FirestoreError,
  type Query,
  type QuerySnapshot,
  type SnapshotMetadata,
} from 'firebase/firestore'

const logKey = 'henhouse.roomSync'
const logLimit = 150
export const roomSyncEvent = 'henhouse:room-sync'
const retryEvent = 'henhouse:room-retry'
const failed = new Set<object>()
export const hasRoomSyncError = () => failed.size > 0
export const retryRoomSync = () => window.dispatchEvent(new Event(retryEvent))

type Scope = {
  feed: 'lookup' | 'game' | 'players' | 'round' | 'player-view' | 'reactions' | 'ballot' | 'shared-game' | 'shared-players' | 'shared-round'
  gameId?: string
  round?: number
}
type State = { phase?: string; round?: number; attempt?: number; revision?: number; count?: number; questionInstance?: string }
type Entry = Scope & State & { at: string; event: string; reason?: string; source?: 'cache' | 'server' }

let entries: Entry[] = []
try {
  const saved: unknown = JSON.parse(sessionStorage.getItem(logKey) ?? '[]')
  if (Array.isArray(saved)) entries = saved.slice(-logLimit)
} catch { /* Storage can be disabled. Keep logs in memory. */ }

export const getRoomSyncLog = () => JSON.stringify(entries, null, 2)

function record(scope: Scope, event: string, details: Partial<Entry> = {}) {
  entries = [...entries.slice(1 - logLimit), { ...scope, ...details, at: new Date().toISOString(), event }]
  try {
    sessionStorage.setItem(logKey, JSON.stringify(entries))
  } catch { /* Keep the in-memory copy available. */ }
  window.dispatchEvent(new Event(roomSyncEvent))
}

const retryable = new Set(['aborted', 'deadline-exceeded', 'internal', 'resource-exhausted', 'unauthenticated', 'unavailable', 'unknown'])
const maxRetryDelay = 30000
function watch<S extends { metadata: SnapshotMetadata }>(
  scope: Scope,
  subscribe: (next: (snapshot: S) => void, error: (error: FirestoreError) => void) => () => void,
  callback: (snapshot: S) => void,
  describe: (snapshot: S) => State,
) {
  let stop: (() => void) | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let confirmation: ReturnType<typeof setTimeout> | undefined
  let attempts = 0
  let permissionRetries = 0
  let generation = 0
  let confirmed = false
  let lastRestart = -Infinity
  let shouldRetry = false
  const key = {}

  function scheduleRetry(reason: string) {
    clearTimeout(timer)
    shouldRetry = true
    if (document.hidden || !navigator.onLine) return
    const delay = Math.min(1000 * (2 ** attempts), maxRetryDelay)
    attempts = Math.min(attempts + 1, 5)
    timer = setTimeout(() => {
      if (!document.hidden && navigator.onLine) start(reason)
    }, delay)
  }

  function awaitConfirmation() {
    clearTimeout(confirmation)
    confirmation = setTimeout(() => {
      failed.add(key)
      record(scope, 'waiting-for-server')
      scheduleRetry('server-timeout')
    }, 8000)
  }

  function start(reason: string) {
    clearTimeout(timer)
    clearTimeout(confirmation)
    stop?.()
    shouldRetry = false
    const current = ++generation
    const waitForServer = confirmed
    let receivedServer = false
    let lastState = ''
    lastRestart = performance.now()
    record(scope, 'listen', { reason })
    awaitConfirmation()
    stop = subscribe(snapshot => {
      if (generation !== current) return
      const source = snapshot.metadata.fromCache ? 'cache' : 'server'
      let recovered = false
      if (source === 'server') {
        confirmed = receivedServer = true
        attempts = 0
        permissionRetries = 0
        shouldRetry = false
        clearTimeout(timer)
        clearTimeout(confirmation)
        confirmation = undefined
        recovered = failed.delete(key)
      } else if (receivedServer && !confirmation) {
        awaitConfirmation()
      }
      const state = describe(snapshot)
      const signature = JSON.stringify({ source, ...state })
      if (signature !== lastState || recovered) {
        lastState = signature
        record(scope, 'snapshot', { source, ...state })
      }
      // A restarted listener can replay cache before the server responds.
      // Keep the state already shown on screen while waiting for confirmation.
      if (source === 'server' || !waitForServer || receivedServer) callback(snapshot)
    }, error => {
      if (generation !== current) return
      clearTimeout(timer)
      clearTimeout(confirmation)
      failed.add(key)
      record(scope, 'listener-error', { reason: error.code })
      if (retryable.has(error.code)) {
        scheduleRetry('listener-error')
      } else if (error.code === 'permission-denied' && permissionRetries < 3) {
        // A new room member's access can change after the first listen.
        permissionRetries++
        scheduleRetry('listener-error')
      }
    })
  }

  function reconnect(reason: string) {
    if (reason !== 'manual' && (document.hidden || !navigator.onLine || (!shouldRetry && performance.now() - lastRestart < 1000))) return
    attempts = 0
    permissionRetries = 0
    start(reason)
  }

  let hiddenAt = document.hidden ? performance.now() : undefined
  function onVisibility() {
    if (document.hidden) {
      hiddenAt = performance.now()
    } else {
      if (shouldRetry || (hiddenAt !== undefined && performance.now() - hiddenAt >= 1000)) reconnect('foreground')
      hiddenAt = undefined
    }
  }
  const onOnline = () => {
    attempts = 0
    permissionRetries = 0
    start('online')
  }
  const onOffline = () => {
    clearTimeout(timer)
    clearTimeout(confirmation)
    shouldRetry = true
    failed.add(key)
    record(scope, 'offline')
  }
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) reconnect('page-restored')
  }
  const onRetry = () => reconnect('manual')
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener(retryEvent, onRetry)
  start('initial')

  const unsubscribe = () => {
    ++generation
    clearTimeout(timer)
    clearTimeout(confirmation)
    stop?.()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    window.removeEventListener('pageshow', onPageShow)
    window.removeEventListener(retryEvent, onRetry)
    if (failed.delete(key)) window.dispatchEvent(new Event(roomSyncEvent))
  }
  return Object.assign(unsubscribe, { restart: () => reconnect('projection-lag') })
}

export function watchRoomDocument<T>(
  ref: DocumentReference,
  scope: Scope,
  callback: (snapshot: DocumentSnapshot) => void,
  describe?: (data: T) => State,
) {
  return watch<DocumentSnapshot>(scope, (next, error) => onSnapshot(ref, { includeMetadataChanges: true }, next, error),
    snapshot => {
      if (snapshot.exists() || !snapshot.metadata.fromCache) callback(snapshot)
    }, snapshot => snapshot.exists() ? describe?.(snapshot.data() as T) ?? {} : { phase: 'missing' })
}

export function watchRoomCollection(
  ref: Query,
  scope: Scope,
  callback: (snapshot: QuerySnapshot) => void,
) {
  return watch<QuerySnapshot>(scope, (next, error) => onSnapshot(ref, { includeMetadataChanges: true }, next, error),
    callback, snapshot => ({ count: snapshot.size }))
}
