import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function SharedViewLink({ code }: { code: string }) {
  const [message, setMessage] = useState('')
  const [showLink, setShowLink] = useState(false)
  const path = '/shared/' + encodeURIComponent(code)
  const url = window.location.origin + path

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setMessage('Link copied')
    } catch {
      setShowLink(true)
      setMessage('Select the link to copy it.')
    }
  }

  return (
    <details className="rounded-xl border border-outline-variant/60 bg-surface-container-low px-3">
      <summary className="cursor-pointer min-h-11 content-center font-bold text-info">Shared View</summary>
      <div className="space-y-2 pb-3 text-sm">
        <p>On the other screen, open chickenparty.web.app, choose Shared View, and enter {code}.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void copy()} className="min-h-11 rounded-xl bg-action px-3 font-bold text-on-action">Copy Shared View link</button>
          <Link to={path} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center px-2 underline">Open in new tab</Link>
        </div>
        {showLink && <input aria-label="Shared View link" value={url} readOnly onFocus={event => event.currentTarget.select()} className="w-full rounded-lg border border-outline bg-surface-container-high p-2" />}
        {message && <p role="status" className="text-on-surface-variant">{message}</p>}
      </div>
    </details>
  )
}
