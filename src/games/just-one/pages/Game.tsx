import { useNavigate } from 'react-router-dom'

export default function JustOneGame() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface linen-texture">
      <div className="text-center space-y-6 px-4">
        <h1 className="text-5xl font-bold text-on-surface font-headline">Just One</h1>
        <div className="space-y-2">
          <p className="text-2xl text-on-surface-variant font-headline">🚀 Coming Soon!</p>
          <p className="text-lg text-on-surface font-body">
            The next party game is under construction.
          </p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="bg-primary text-on-primary px-6 py-3 rounded-xl font-semibold font-body tracking-wide hover:opacity-90 transition-opacity"
        >
          Back to Home
        </button>
      </div>
    </div>
  )
}
