/** Imperative thumb vote animations — shared by RevealView and RoundResultView. */
export function animateThumbBtn(btn: HTMLButtonElement, type: 'up' | 'down') {
  const cls = type === 'up' ? 'animate-thumb-punch' : 'animate-thumb-shake'
  btn.classList.remove(cls)
  void btn.offsetWidth
  btn.classList.add(cls)
  btn.addEventListener('animationend', () => btn.classList.remove(cls), { once: true })
}

export function burstThumbParticles(btn: HTMLButtonElement, type: 'up' | 'down') {
  const r = btn.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const colors = type === 'up'
    ? ['#91c595', '#c4e5c5', '#4caf66', '#b8e4bc']
    : ['#f08080', '#e05050', '#c44444', '#f4a0a0']
  const count = type === 'up' ? 8 : 5
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div')
    const angle = (i / count) * Math.PI * 2
    const dist = type === 'up' ? 24 + Math.random() * 16 : 16 + Math.random() * 12
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist - (type === 'up' ? 8 : 0)
    p.style.cssText = [
      'position:fixed', 'width:6px', 'height:6px', 'border-radius:50%',
      'pointer-events:none', 'z-index:9999',
      `left:${cx}px`, `top:${cy}px`,
      `background:${colors[i % colors.length]}`,
      'animation:thumb-particle 0.5s ease-out forwards',
      `--thumb-dx:${dx}px`, `--thumb-dy:${dy}px`,
    ].join(';')
    document.body.appendChild(p)
    setTimeout(() => p.remove(), 550)
  }
}

export function playThumbVoteFx(btn: HTMLButtonElement, type: 'up' | 'down') {
  animateThumbBtn(btn, type)
  burstThumbParticles(btn, type)
}
