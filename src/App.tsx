import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'

const FlockGame = lazy(() => import('@flock/pages/Game'))
const FowlWordsGame = lazy(() => import('@fowl-words/pages/Game'))
const TruthOrTurdGame = lazy(() => import('@truth-or-turd/pages/Game'))
const FlockPreview = import.meta.env.DEV
  ? lazy(() => import('./dev/FlockPreview'))
  : null
const FowlWordsPreview = import.meta.env.DEV
  ? lazy(() => import('./dev/FowlWordsPreview'))
  : null

const Loading = () => (
  <div className="min-h-screen flex items-center justify-center bg-surface linen-texture">
    <p className="text-lg text-on-surface-variant font-body">Loading game...</p>
  </div>
)

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {FlockPreview && (
        <>
          <Route
            path="/dev/flock"
            element={
              <Suspense fallback={<Loading />}>
                <FlockPreview />
              </Suspense>
            }
          />
          <Route
            path="/dev/flock/:screen"
            element={
              <Suspense fallback={<Loading />}>
                <FlockPreview />
              </Suspense>
            }
          />
        </>
      )}
      {FowlWordsPreview && (
        <>
          <Route
            path="/dev/fowl-words"
            element={
              <Suspense fallback={<Loading />}>
                <FowlWordsPreview />
              </Suspense>
            }
          />
          <Route
            path="/dev/fowl-words/:screen"
            element={
              <Suspense fallback={<Loading />}>
                <FowlWordsPreview />
              </Suspense>
            }
          />
        </>
      )}
      <Route
        path="/flock/:code"
        element={
          <Suspense fallback={<Loading />}>
            <FlockGame />
          </Suspense>
        }
      />
      <Route
        path="/fowl-words/:code"
        element={
          <Suspense fallback={<Loading />}>
            <FowlWordsGame />
          </Suspense>
        }
      />
      <Route
        path="/truth-or-turd/:code"
        element={
          <Suspense fallback={<Loading />}>
            <TruthOrTurdGame />
          </Suspense>
        }
      />
      {/* Legacy route for backwards compatibility */}
      <Route
        path="/game/:code"
        element={
          <Suspense fallback={<Loading />}>
            <FlockGame />
          </Suspense>
        }
      />
    </Routes>
  )
}
