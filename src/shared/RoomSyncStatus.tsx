import { useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { getRoomSyncLog, hasRoomSyncError, retryRoomSync, roomSyncEvent } from './roomSync'

function subscribe(notify: () => void) {
  window.addEventListener(roomSyncEvent, notify)
  return () => window.removeEventListener(roomSyncEvent, notify)
}

function downloadLog() {
  const url = URL.createObjectURL(new Blob([getRoomSyncLog()], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'henhouse-room-sync.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function RoomSyncStatus() {
  const { search } = useLocation()
  const problem = useSyncExternalStore(subscribe, hasRoomSyncError)
  const debug = new URLSearchParams(search).get('syncDebug') === '1'
  if (!problem && !debug) return null

  return (
    <aside className="fixed inset-x-2 top-2 z-50 mx-auto flex max-w-md flex-wrap items-center justify-between gap-2 rounded-xl border border-outline-variant/60 bg-surface-container-high p-2 text-sm text-on-surface shadow-sm">
      <span role="status">{problem ? 'Room updates are delayed.' : 'Room connection diagnostics'}</span>
      <div className="flex gap-2">
        {debug && <button type="button" className="rounded-lg bg-primary px-3 py-2 font-semibold text-on-primary" onClick={retryRoomSync}>
          Reconnect
        </button>}
        <button type="button" className="rounded-lg border border-outline px-3 py-2" onClick={downloadLog}>
          Save sync log
        </button>
      </div>
    </aside>
  )
}
