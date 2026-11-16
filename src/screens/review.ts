// Révision espacée orale : on redit à voix haute la version correcte de ses erreurs passées.
import { dueCards, review, nextIntervalLabel, type Card, type Grade } from '../lib/srs'
import { compareWords } from '../lib/tutor/analysis'
import { listen, type ListenHandle } from '../lib/speech/stt'
import { speak, stopSpeaking } from '../lib/speech/tts'
import { ensureWhisper } from '../lib/ai'
import { getState, update, bumpToday } from '../lib/store'
import { esc, on } from '../lib/ui'

export function render(root: HTMLElement) {
  const st = getState().settings
  let queue = dueCards(getState().cards)
  let shown = false
  let handle: ListenHandle | null = null
  let alive = true
  let done = 0

  const hint = (c: Card) => c.back.split(' ').map((w) => w[0] + '·'.repeat(Math.max(0, Math.min(4, w.length - 1)))).join(' ')

  function paint() {
    const c = queue[0]
    if (!c) {
      const total = getState().cards.length
      root.innerHTML = `<section class="card empty"><div class="big">${done ? '✅' : '🧠'}</div>
        <h2>${done ? `${done} carte${done > 1 ? 's' : ''} révisée${done > 1 ? 's' : ''}` : 'Rien à réviser'}</h2>
        <p>${total ? `Vous avez ${total} cartes. Les prochaines reviendront au bon moment.` : 'Vos erreurs de conversation et les expressions proposées par le tuteur apparaîtront ici.'}</p>
        <a class="btn primary" href="#/talk">Parler avec le tuteur</a></section>
        ${total ? `<details class="card"><summary><b>Toutes les cartes (${total})</b></summary>${getState().cards.slice().reverse().map((k) => `
          <div class="session"><div class="small muted">${k.kind === 'mistake' ? 'Erreur' : 'Expression'} · prochaine révision ${new Date(k.due).toLocaleDateString('fr-FR')}</div>
          <div>${esc(k.back)}</div>${k.kind === 'mistake' ? `<div class="small muted"><s>${esc(k.front)}</s></div>` : `<div class="small muted">${esc(k.front)}</div>`}
          <button class="btn small ghost" data-del="${k.id}">Supprimer</button></div>`).join('')}</details>` : ''}`
      return
    }
    const isMistake = c.kind === 'mistake'
    root.innerHTML = `
      <div class="row between"><h1>Révision</h1><span class="chip">${queue.length} restante${queue.length > 1 ? 's' : ''}</span></div>
      <section class="card">
        <div class="small muted">${isMistake ? 'Vous aviez dit — dites-le correctement :' : 'Comment dit-on en anglais :'}</div>
        <p class="flash-front">${esc(c.front)}</p>
        ${!isMistake ? `<p class="small muted">Indice : ${esc(hint(c))}</p>` : ''}
        <div class="row"><button class="btn accent" data-a="say">🎙 Répondre à l'oral</button><button class="btn" data-a="show">Afficher</button></div>
        <div class="said" style="margin-top:10px"></div>
        ${shown ? `<div class="flash-back">
          <div class="row between"><b>${esc(c.back)}</b><button class="btn small ghost" data-a="listen">🔊</button></div>
          ${c.note ? `<p class="small muted">${esc(c.note)}</p>` : ''}
        </div>` : ''}
      </section>
      ${shown ? `<div class="grades">
        ${(['À revoir', 'Difficile', 'Bien', 'Facile'] as const).map((l, g) => `<button class="btn" data-g="${g}">${l}<small>${nextIntervalLabel(c, g as Grade)}</small></button>`).join('')}
      </div>` : ''}`
  }

  async function say() {
    if (handle) { handle.stop(); return }
    if (!(await ensureWhisper())) return
    const c = queue[0]
    const out = root.querySelector<HTMLElement>('.said')!
    out.innerHTML = '<span class="muted">Je vous écoute…</span>'
    try {
      handle = await listen({ engine: st.sttEngine, accent: st.accent, autoStop: true,
        onTranscribing: () => { out.innerHTML = '<span class="muted">Analyse…</span>' } })
      const r = await handle.result
      if (!alive) return
      const { diff, score } = compareWords(c.back, r.text)
      shown = true
      paint()
      root.querySelector<HTMLElement>('.said')!.innerHTML =
        `<div class="diff">${diff.map((d) => `<span class="${d.status}">${esc(d.word)}</span>`).join('')}</div>
         <p class="small">Score : <b>${score} %</b> — entendu : « ${esc(r.text)} »</p>`
      // suggestion de note selon le score
      const g = score >= 95 ? 3 : score >= 80 ? 2 : score >= 55 ? 1 : 0
      root.querySelector<HTMLElement>(`[data-g="${g}"]`)?.classList.add('primary')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') out.textContent = (e as Error).message
    } finally { handle = null }
  }

  paint()
  on(root, 'click', '[data-a]', (el) => {
    const a = el.dataset.a
    if (a === 'show') { shown = true; paint() }
    else if (a === 'say') void say()
    else if (a === 'listen') void speak(queue[0].back, { rate: st.ttsRate, voice: st.voice, lang: st.accent })
  })
  on(root, 'click', '[data-g]', (el) => {
    const c = queue.shift()!
    const r = review(c, Number(el.dataset.g) as Grade)
    update((s) => { s.cards = s.cards.map((k) => (k.id === c.id ? r : k)) })
    bumpToday({ reviews: 1 })
    done++
    if (r.due <= Date.now() + 15 * 60_000) queue.push(r) // « à revoir » : revient dans cette séance
    shown = false
    paint()
  })
  on(root, 'click', '[data-del]', (el) => {
    update((s) => { s.cards = s.cards.filter((k) => k.id !== el.dataset.del) })
    paint()
  })
  return () => { alive = false; handle?.cancel(); void stopSpeaking() }
}
