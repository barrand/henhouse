/** Peer award animations: heart float, boo float, star float, card pulse, Most Helpful stamp. */

import { animateThumbBtn } from './thumbVoteFx'

const activeHeartNodes: HTMLElement[] = []
const activeBooNodes: HTMLElement[] = []
const activeStarNodes: HTMLElement[] = []
const MAX_FLOAT_NODES = 8

function capFloatNodes(pool: HTMLElement[], el: HTMLElement) {
  if (pool.length >= MAX_FLOAT_NODES) pool.shift()?.remove()
  pool.push(el)
}

function cleanupFloatNode(pool: HTMLElement[], el: HTMLElement) {
  el.remove()
  const i = pool.indexOf(el)
  if (i !== -1) pool.splice(i, 1)
}

function burstGoldParticles(btn: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const r = btn.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const colors = ['var(--color-sun)', 'var(--color-cream)', 'var(--color-tang)']
  const count = 10
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div')
    const angle = (i / count) * Math.PI * 2
    const dist = 28 + Math.random() * 18
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist - 10
    p.style.cssText = [
      'position:fixed', 'width:7px', 'height:7px', 'border-radius:50%',
      'pointer-events:none', 'z-index:9999',
      `left:${cx}px`, `top:${cy}px`,
      `background:${colors[i % colors.length]}`,
      'animation:thumb-particle 0.55s ease-out forwards',
      `--thumb-dx:${dx}px`, `--thumb-dy:${dy}px`,
    ].join(';')
    document.body.appendChild(p)
    setTimeout(() => p.remove(), 600)
  }
}

export function spawnHeartFloat(sourceEl: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const r = sourceEl.getBoundingClientRect()
  const el = document.createElement('span')
  el.textContent = '❤️'
  el.style.cssText = [
    'position:fixed', 'font-size:18px', 'pointer-events:none', 'z-index:9999',
    `left:${r.left + r.width / 2}px`, `top:${r.top}px`, 'transform:translate(-50%,0)',
  ].join(';')
  el.classList.add('animate-heart-float')
  document.body.appendChild(el)
  capFloatNodes(activeHeartNodes, el)
  const cleanup = () => cleanupFloatNode(activeHeartNodes, el)
  el.addEventListener('animationend', cleanup, { once: true })
  setTimeout(cleanup, 1100)
}

export function spawnBooFloat(sourceEl: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const r = sourceEl.getBoundingClientRect()
  const el = document.createElement('span')
  el.textContent = 'boo!'
  el.style.cssText = [
    'position:fixed', 'font-size:13px', 'font-weight:800', 'letter-spacing:0.04em',
    'text-transform:lowercase', 'color:var(--color-lilac)',
    'pointer-events:none', 'z-index:9999',
    `left:${r.left + r.width / 2}px`, `top:${r.top}px`, 'transform:translate(-50%,0)',
  ].join(';')
  el.classList.add('animate-boo-float')
  document.body.appendChild(el)
  capFloatNodes(activeBooNodes, el)
  const cleanup = () => cleanupFloatNode(activeBooNodes, el)
  el.addEventListener('animationend', cleanup, { once: true })
  setTimeout(cleanup, 1100)
}

export function spawnStarFloat(sourceEl: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const r = sourceEl.getBoundingClientRect()
  const el = document.createElement('span')
  el.textContent = '⭐'
  el.style.cssText = [
    'position:fixed', 'font-size:20px', 'pointer-events:none', 'z-index:9999',
    `left:${r.left + r.width / 2}px`, `top:${r.top}px`, 'transform:translate(-50%,0)',
  ].join(';')
  el.classList.add('animate-star-float')
  document.body.appendChild(el)
  capFloatNodes(activeStarNodes, el)
  const cleanup = () => cleanupFloatNode(activeStarNodes, el)
  el.addEventListener('animationend', cleanup, { once: true })
  setTimeout(cleanup, 1100)
}

export function pulseCardLove(cardEl: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  cardEl.classList.remove('animate-card-pulse-love')
  void cardEl.offsetWidth
  cardEl.classList.add('animate-card-pulse-love')
  cardEl.addEventListener('animationend', () => cardEl.classList.remove('animate-card-pulse-love'), { once: true })
}

export function pulseCardMostHelpful(cardEl: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  cardEl.classList.remove('animate-card-pulse-mvp')
  void cardEl.offsetWidth
  cardEl.classList.add('animate-card-pulse-mvp')
  cardEl.addEventListener('animationend', () => cardEl.classList.remove('animate-card-pulse-mvp'), { once: true })
}

export function shakeCardBoo(cardEl: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  cardEl.classList.remove('animate-card-shake')
  void cardEl.offsetWidth
  cardEl.classList.add('animate-card-shake')
  cardEl.addEventListener('animationend', () => cardEl.classList.remove('animate-card-shake'), { once: true })
}

export function pulseCardUnlock(cardEl: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  cardEl.classList.remove('animate-card-unlock-pulse')
  void cardEl.offsetWidth
  cardEl.classList.add('animate-card-unlock-pulse')
  cardEl.addEventListener('animationend', () => cardEl.classList.remove('animate-card-unlock-pulse'), { once: true })
}

export function playMostHelpfulAwardFx(btn: HTMLButtonElement, cardEl?: HTMLElement | null) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  animateThumbBtn(btn, 'up')
  spawnStarFloat(btn)
  burstGoldParticles(btn)
  if (cardEl) pulseCardMostHelpful(cardEl)
}

export function playBooAwardFx(btn: HTMLButtonElement, cardEl?: HTMLElement | null) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  animateThumbBtn(btn, 'down')
  spawnBooFloat(btn)
  if (cardEl) shakeCardBoo(cardEl)
}

export function stampMostHelpful(badgeEl: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  badgeEl.classList.remove('animate-star-stamp')
  void badgeEl.offsetWidth
  badgeEl.classList.add('animate-star-stamp')
  badgeEl.addEventListener('animationend', () => badgeEl.classList.remove('animate-star-stamp'), { once: true })
  const r = badgeEl.getBoundingClientRect()
  const proxy = document.createElement('button')
  proxy.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;width:1px;height:1px;pointer-events:none;opacity:0;`
  document.body.appendChild(proxy)
  burstGoldParticles(proxy)
  setTimeout(() => proxy.remove(), 600)
}
