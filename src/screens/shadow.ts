// Shadowing : écouter une phrase native, la répéter, voir la comparaison mot à mot.
import { SHADOW_SETS } from '../data/shadowing'
import { compareWords } from '../lib/tutor/analysis'
import { listen, type ListenHandle } from '../lib/speech/stt'
import { speak, stopSpeaking } from '../lib/speech/tts'
import { ensureWhisper } from '../lib/ai'
import { getState, bumpToday, update } from '../lib/store'
import { newCard } from '../lib/srs'
import { esc, on, navigate, toast } from '../lib/ui'

export function render(root: HTMLElement, params: string[]) {
  const set = SHADOW_SETS.find((s) => s.id === params[0])
  if (!set) {
    root.innerHTML = `
      <h1>Shadowing</h1>
      <p class="muted">Écoutez, puis répétez immédiatement en imitant le rythme et l'intonation. C'est l'exercice le plus efficace pour gagner en aisance et en accent.</p>
      <div class="list-grid">${SHADOW_SETS.map((s) => `
        <div class="card scen" data-id="${s.id}"><div class="ico">🔁</div>
          <div><h3>${esc(s.title)}</h3><p class="small muted">${esc(s.focus)} · ${s.lines.length} phrases</p></div></div>`).join('')}
      </div>`
    on(root, 'click', '.scen', (el) => navigate('#/shadow/' + el.dataset.id))
    return
  }

  const cur = set
  const st = getState().settings
  let i = 0
  let handle: ListenHandle | null = null
  let alive = true
  const scores: number[] = []

  const paint = () => {
    const line = cur.lines[i]
    root.innerHTML = `
      <div class="row between"><a href="#/shadow" class="small muted">← Thèmes</a><span class="small muted">${i + 1} / ${cur.lines.length}</span></div>
      <section class="card">
        <h3>${esc(cur.title)}</h3>
        <p class="target">${esc(line)}</p>
        <div class="row">
          <button class="btn" data-a="play">🔊 Écouter</button>
          <button class="btn" data-a="slow">🐢 Lentement</button>
          <button class="btn accent" data-a="rec">🎙 Répéter</button>
        </div>
        <div class="result" style="margin-top:14px"></div>
      </section>
      <div class="row between" style="flex-wrap:nowrap">
        <button class="btn ghost small" data-a="prev" ${i === 0 ? 'disabled' : ''}>←</button>
        <button class="btn ghost small" data-a="save" title="Ajouter à la révision">＋ Révision</button>
        <button class="btn primary" data-a="next">${i === cur.lines.length - 1 ? 'Terminer' : 'Suivante →'}</button>
      </div>`
  }

  const play = (rate: number) => speak(cur.lines[i], { rate, voice: st.voice, lang: st.accent })

  async function rec(btn: HTMLElement) {
    if (handle) { handle.stop(); return }
    if (!(await ensureWhisper())) return
    await stopSpeaking()
    const res = root.querySelector<HTMLElement>('.result')!
    btn.textContent = '■ Stop'
    res.innerHTML = '<p class="muted">Je vous écoute…</p>'
    try {
      handle = await listen({ engine: st.sttEngine, accent: st.accent, autoStop: true,
        onTranscribing: () => { res.innerHTML = '<p class="muted">Analyse…</p>' } })
      const r = await handle.result
      if (!alive) return
      if (!r.text) { res.innerHTML = '<p class="muted">Rien entendu, réessayez.</p>'; return }
      const { diff, score } = compareWords(cur.lines[i], r.text)
      scores.push(score)
      bumpToday({ shadowSum: score, shadowCount: 1 })
      const cls = score >= 85 ? 'good' : score >= 60 ? 'mid' : 'low'
      res.innerHTML = `
        <div class="row" style="align-items:center"><span class="score ${cls}">${score} %</span>
          <span class="muted small">${score >= 85 ? 'Excellent ! Passez à la suivante.' : score >= 60 ? 'Presque. Réécoutez puis recommencez.' : 'Écoutez lentement, puis répétez par morceaux.'}</span></div>
        <div class="diff">${diff.map((d) => `<span class="${d.status}" title="${d.heard ? 'entendu : ' + esc(d.heard) : ''}">${esc(d.word)}</span>`).join('')}</div>
        <p class="small muted">Entendu : « ${esc(r.text)} »</p>`
    } catch (e) {
      if ((e as Error).name !== 'AbortError') res.innerHTML = `<p class="muted">Micro indisponible : ${esc((e as Error).message)}</p>`
    } finally {
      handle = null
      if (alive) btn.textContent = '🎙 Répéter'
    }
  }

  paint()
  on(root, 'click', '[data-a]', (el) => {
    const a = el.dataset.a
    if (a === 'play') void play(st.ttsRate)
    else if (a === 'slow') void play(Math.max(0.5, st.ttsRate * 0.7))
    else if (a === 'rec') void rec(el)
    else if (a === 'prev') { i = Math.max(0, i - 1); paint() }
    else if (a === 'save') {
      update((s) => { s.cards.push(newCard('expression', `Shadowing — ${cur.title} (dites la phrase)`, cur.lines[i], '')) })
      toast('Ajoutée à la révision')
    } else if (a === 'next') {
      if (i < cur.lines.length - 1) { i++; paint(); void play(st.ttsRate) }
      else {
        const avg = scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : 0
        root.innerHTML = `<section class="card empty"><div class="big">🎉</div><h2>Thème terminé</h2>
          <p>${scores.length ? `Score moyen : <b>${avg} %</b> sur ${scores.length} essais.` : ''}</p>
          <div class="row" style="justify-content:center"><a class="btn" href="#/shadow">Autres thèmes</a><a class="btn primary" href="#/talk">Passer à la conversation</a></div></section>`
      }
    }
  })
  return () => { alive = false; handle?.cancel(); void stopSpeaking() }
}
