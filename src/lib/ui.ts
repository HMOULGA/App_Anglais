// Petits utilitaires d'interface (sans framework).

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector(sel)
  if (!el) throw new Error(`Élément introuvable : ${sel}`)
  return el as HTMLElement
}

export function on(root: HTMLElement, event: string, selector: string, fn: (el: HTMLElement, e: Event) => void): void {
  root.addEventListener(event, (e) => {
    const t = (e.target as HTMLElement).closest(selector) as HTMLElement | null
    if (t && root.contains(t)) fn(t, e)
  })
}

export function toast(msg: string, ms = 2600): void {
  const t = document.createElement('div')
  t.className = 'toast'
  t.textContent = msg
  document.body.appendChild(t)
  requestAnimationFrame(() => t.classList.add('show'))
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300) }, ms)
}

export function modal(html: string, onMount?: (el: HTMLElement, close: () => void) => void): () => void {
  const wrap = document.createElement('div')
  wrap.className = 'modal-wrap'
  wrap.innerHTML = `<div class="modal" role="dialog">${html}</div>`
  document.body.appendChild(wrap)
  const close = () => wrap.remove()
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close() })
  onMount?.(wrap.querySelector('.modal') as HTMLElement, close)
  return close
}

export function fmtMin(sec: number): string {
  const m = Math.round(sec / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

export function navigate(hash: string): void { location.hash = hash }
