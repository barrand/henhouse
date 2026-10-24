import { useLayoutEffect, useRef, type ReactNode } from 'react'

/** Keep screen actions reachable and reserve their actual height in the scroll content. */
export default function BottomActionDock({ children }: { children: ReactNode }) {
  const dockRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const dock = dockRef.current
    const screen = dock?.closest<HTMLElement>('[data-action-screen]')
    if (!dock || !screen) return
    const measure = () => screen.style.setProperty('--bottom-action-height', `${dock.getBoundingClientRect().height}px`)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(dock)
    return () => {
      observer.disconnect()
      screen.style.removeProperty('--bottom-action-height')
    }
  }, [])

  return (
    <div ref={dockRef} role="region" aria-label="Game actions" className="bottom-action-dock fixed inset-x-0 bottom-0 z-40 action-dock p-4 max-h-[70dvh] overflow-y-auto">
      <div className="max-w-md mx-auto space-y-3">{children}</div>
    </div>
  )
}
