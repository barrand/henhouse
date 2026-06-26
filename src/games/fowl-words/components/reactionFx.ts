/** Peer award animations: heart float, boo float, card pulse, MVP star stamp. */

import { burstThumbParticles } from './thumbVoteFx'

const activeHeartNodes: HTMLElement[] = []
const activeBooNodes: HTMLElement[] = []
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

export function spawnHeartFloat(sourceEl: HTMLElement) {
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
  const r = sourceEl.getBoundingClientRect()
  const el = document.createElement('span')
  el.textContent = 'boo!'
  el.style.cssText = [
    'position:fixed', 'font-size:13px', 'font-weight:800', 'letter-spacing:0.04em',
    'text-transform:lowercase', 'color:#ffb4ab',
    'text-shadow:0 1px 0 rgba(42,31,14,0.35)', 'pointer-events:none', 'z-index:9999',
    `left:${r.left + r.width / 2}px`, `top:${r.top}px`, 'transform:translate(-50%,0)',
  ].join(';')
  el.classList.add('animate-boo-float')
  document.body.appendChild(el)
  capFloatNodes(activeBooNodes, el)
  const cleanup = () => cleanupFloatNode(activeBooNodes, el)
  el.addEventListener('animationend', cleanup, { once: true })
  setTimeout(cleanup, 1100)
}

export function pulseCardLove(cardEl: HTMLElement) {
  cardEl.classList.remove('animate-card-pulse-love')
  void cardEl.offsetWidth
  cardEl.classList.add('animate-card-pulse-love')
  cardEl.addEventListener('animationend', () => cardEl.classList.remove('animate-card-pulse-love'), { once: true })
}

export function shakeCardBoo(cardEl: HTMLElement) {
  cardEl.classList.remove('animate-thumb-shake')
  void cardEl.offsetWidth
  cardEl.classList.add('animate-thumb-shake')
  cardEl.addEventListener('animationend', () => cardEl.classList.remove('animate-thumb-shake'), { once: true })
}

export function stampMostHelpful(badgeEl: HTMLElement) {
  badgeEl.classList.remove('animate-star-stamp')
  void badgeEl.offsetWidth
  badgeEl.classList.add('animate-star-stamp')
  badgeEl.addEventListener('animationend', () => badgeEl.classList.remove('animate-star-stamp'), { once: true })
  const r = badgeEl.getBoundingClientRect()
  const proxy = document.createElement('button')
  proxy.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;width:1px;height:1px;pointer-events:none;opacity:0;`
  document.body.appendChild(proxy)
  burstThumbParticles(proxy, 'up')
  setTimeout(() => proxy.remove(), 600)
}
