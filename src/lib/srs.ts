// Répétition espacée (variante SM-2) pour les erreurs et expressions à retenir.

export type Grade = 0 | 1 | 2 | 3 // 0 = à revoir, 1 = difficile, 2 = bien, 3 = facile

export interface Card {
  id: string
  kind: 'mistake' | 'expression'
  front: string // ce que l'apprenant a dit / l'expression à produire
  back: string // la version correcte / naturelle
  note: string // explication courte
  created: number
  due: number
  interval: number // jours
  ease: number
  reps: number
  lapses: number
}

const DAY = 86_400_000

export function newCard(kind: Card['kind'], front: string, back: string, note = '', now = Date.now()): Card {
  return {
    id: Math.random().toString(36).slice(2, 10) + now.toString(36),
    kind, front, back, note,
    created: now, due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0,
  }
}

export function review(card: Card, grade: Grade, now = Date.now()): Card {
  const c = { ...card }
  if (grade === 0) {
    c.lapses += 1
    c.reps = 0
    c.interval = 0
    c.ease = Math.max(1.3, c.ease - 0.2)
    c.due = now + 10 * 60_000 // revoir dans 10 minutes
    return c
  }
  c.reps += 1
  c.ease = Math.max(1.3, c.ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0))
  if (c.reps === 1) c.interval = grade === 3 ? 3 : 1
  else if (c.reps === 2) c.interval = grade === 1 ? 3 : 6
  else c.interval = Math.round(c.interval * c.ease * (grade === 1 ? 0.6 : grade === 3 ? 1.3 : 1))
  c.interval = Math.max(1, c.interval)
  c.due = now + c.interval * DAY
  return c
}

export function dueCards(cards: Card[], now = Date.now()): Card[] {
  return cards.filter((c) => c.due <= now).sort((a, b) => a.due - b.due)
}

export function nextIntervalLabel(card: Card, grade: Grade): string {
  const r = review(card, grade, 0)
  if (r.due < DAY) return '10 min'
  const d = Math.round(r.due / DAY)
  return d < 30 ? `${d} j` : `${Math.round(d / 30)} mois`
}
