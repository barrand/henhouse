import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'

const FlockGame = lazy(() => import('@flock/pages/Game'))
const FowlWordsGame = lazy(() => import('@fowl-words/pages/Game'))

const Loading = () => (
  <div className="min-h-screen flex items-center justify-center bg-surface linen-texture">
    <p className="text-lg text-on-surface-variant font-body">Loading game...</p>
  </div>
)

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
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
