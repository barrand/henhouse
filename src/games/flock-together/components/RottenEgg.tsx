interface Props {
  size?: number
  className?: string
  animate?: boolean
}

export default function RottenEgg({ size = 32, className = '', animate = false }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${animate ? 'animate-rotten-wobble' : ''} ${className}`}
    >
      {/* Stink cloud - back */}
      <ellipse cx="18" cy="14" rx="6" ry="3" fill="#c5e84d" opacity="0.3" />
      <ellipse cx="46" cy="10" rx="5" ry="2.5" fill="#c5e84d" opacity="0.25" />

      {/* Stink wavy lines */}
      <path d="M20 22c-1-3-3-5-1-9" stroke="#a3b836" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M32 18c0-3 2-5 1-9" stroke="#a3b836" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M44 20c1-3 0-5 2-8" stroke="#a3b836" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />

      {/* Egg shadow */}
      <ellipse cx="32" cy="58" rx="16" ry="3" fill="#000" opacity="0.08" />

      {/* Main egg body */}
      <ellipse cx="32" cy="38" rx="18" ry="22" fill="#8B9B2E" />
      <ellipse cx="32" cy="38" rx="18" ry="22" fill="url(#rottenGradient)" />

      {/* Splotches / mold spots */}
      <circle cx="24" cy="34" r="3.5" fill="#6B7D1A" opacity="0.6" />
      <circle cx="40" cy="42" r="4" fill="#5C6D15" opacity="0.5" />
      <circle cx="35" cy="30" r="2" fill="#6B7D1A" opacity="0.4" />
      <circle cx="26" cy="48" r="2.5" fill="#5C6D15" opacity="0.45" />

      {/* Crack line */}
      <path
        d="M22 28 L26 32 L23 36 L28 38 L24 42"
        stroke="#4A5A10"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Crack chip - piece broken off at top */}
      <path
        d="M38 18 L42 20 L40 16 Z"
        fill="#7A8B24"
        stroke="#4A5A10"
        strokeWidth="0.5"
      />
      <path
        d="M37 19 L42 21"
        stroke="#4A5A10"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Face - angry/grumpy eyes */}
      <ellipse cx="26" cy="37" rx="3" ry="3.5" fill="white" />
      <ellipse cx="38" cy="37" rx="3" ry="3.5" fill="white" />
      <circle cx="27" cy="37.5" r="1.8" fill="#2D3311" />
      <circle cx="39" cy="37.5" r="1.8" fill="#2D3311" />
      <circle cx="27.5" cy="37" r="0.6" fill="white" />
      <circle cx="39.5" cy="37" r="0.6" fill="white" />

      {/* Angry eyebrows */}
      <path d="M22 33 L28 34.5" stroke="#2D3311" strokeWidth="2" strokeLinecap="round" />
      <path d="M42 33 L36 34.5" stroke="#2D3311" strokeWidth="2" strokeLinecap="round" />

      {/* Grimace mouth */}
      <path d="M27 44 Q32 47 37 44" stroke="#2D3311" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M29 44.5 L29 43" stroke="#2D3311" strokeWidth="1" strokeLinecap="round" />
      <path d="M32 45 L32 43.5" stroke="#2D3311" strokeWidth="1" strokeLinecap="round" />
      <path d="M35 44.5 L35 43" stroke="#2D3311" strokeWidth="1" strokeLinecap="round" />

      {/* Fly 1 */}
      <g transform="translate(48, 24)">
        <ellipse cx="0" cy="0" rx="2" ry="1.2" fill="#333" />
        <ellipse cx="-1.5" cy="-1.5" rx="1.8" ry="1" fill="#aaa" opacity="0.6" transform="rotate(-20)" />
        <ellipse cx="1.5" cy="-1.5" rx="1.8" ry="1" fill="#aaa" opacity="0.6" transform="rotate(20)" />
      </g>

      {/* Fly 2 */}
      <g transform="translate(14, 28)">
        <ellipse cx="0" cy="0" rx="1.5" ry="1" fill="#333" />
        <ellipse cx="-1.2" cy="-1.2" rx="1.5" ry="0.8" fill="#aaa" opacity="0.5" transform="rotate(-15)" />
        <ellipse cx="1.2" cy="-1.2" rx="1.5" ry="0.8" fill="#aaa" opacity="0.5" transform="rotate(15)" />
      </g>

      <defs>
        <radialGradient id="rottenGradient" cx="0.4" cy="0.35" r="0.6">
          <stop offset="0%" stopColor="#A4B838" />
          <stop offset="60%" stopColor="#8B9B2E" />
          <stop offset="100%" stopColor="#6B7D1A" />
        </radialGradient>
      </defs>
    </svg>
  )
}
