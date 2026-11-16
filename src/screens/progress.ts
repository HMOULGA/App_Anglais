import { getState, streak, todayKey } from '../lib/store'
import { scenarioById } from '../lib/tutor/scenarios'
import { esc, fmtMin } from '../lib/ui'

export function render(root: HTMLElement) {
  const s = getState()
  const days = Object.values(s.days)
  const totalSec = days.reduce((a, d) => a + d.speakingSec, 0)
  const totalWords = days.reduce((a, d) => a + d.words, 0)
  const totalTurns = days.reduce((a, d) => a + d.turns, 0)
  const totalMistakes = days.reduce((a, d) => a + d.mistakes, 0)
  const shadowN = days.reduce((a, d) => a + d.shadowCount, 0)
  const shadowAvg = shadowN ? Math.round(days.reduce((a, d) => a + d.shadowSum, 0) / shadowN) : 0
  const accuracy = totalTurns ? Math.round(100 * (1 - totalMistakes / totalTurns)) : 0

  // 14 derniers jours
  const last: { k: string; min: number; label: string }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const k = todayKey(d)
    last.push({ k, min: (s.days[k]?.speakingSec ?? 0) / 60, label: String(d.getDate()) })
  }
  const max = Math.max(s.settings.dailyGoalMin, ...last.map((x) => x.min))

  // vitesse d'élocution par séance (tendance)
  const withWpm = s.sessions.filter((x) => x.speakingSec > 20).slice(0, 10).reverse()
  const wpmOf = (x: (typeof withWpm)[number]) => Math.round((x.words / x.speakingSec) * 60)

  root.innerHTML = `
    <h1>Progrès</h1>
    <section class="grid3">
      <div class="stat"><b>🔥 ${streak()}</b><span>jours d'affilée</span></div>
      <div class="stat"><b>${fmtMin(totalSec)}</b><span>de parole au total</span></div>
      <div class="stat"><b>${totalWords.toLocaleString('fr-FR')}</b><span>mots prononcés</span></div>
      <div class="stat"><b>${accuracy} %</b><span>phrases correctes</span></div>
      <div class="stat"><b>${shadowAvg ? shadowAvg + ' %' : '—'}</b><span>précision shadowing</span></div>
      <div class="stat"><b>${s.cards.length}</b><span>cartes de révision</span></div>
    </section>

    <section class="card" style="margin-top:14px">
      <h3>Minutes de parole — 14 derniers jours</h3>
      <div class="bars">${last.map((x) => `<div class="${x.min ? '' : 'zero'}" style="height:${Math.max(2, (x.min / max) * 100)}%" title="${x.k} : ${Math.round(x.min)} min"></div>`).join('')}</div>
      <div class="bars-x">${last.map((x) => `<span>${x.label}</span>`).join('')}</div>
      <p class="small muted">Objectif : ${s.settings.dailyGoalMin} min par jour. La régularité compte plus que la durée.</p>
    </section>

    ${withWpm.length >= 2 ? `<section class="card">
      <h3>Débit (mots / minute) par séance</h3>
      <div class="bars">${withWpm.map((x) => `<div style="height:${Math.min(100, wpmOf(x) / 1.8)}%" title="${wpmOf(x)} mots/min"></div>`).join('')}</div>
      <p class="small muted">Un locuteur natif parle autour de 140–160 mots/min en conversation. Dernière séance : <b>${wpmOf(withWpm[withWpm.length - 1])}</b>.</p>
    </section>` : ''}

    <section class="card">
      <h3>Dernières séances</h3>
      ${s.sessions.length ? s.sessions.slice(0, 15).map((x) => {
        const sc = scenarioById(x.scenario)
        return `<div class="session">
          <div class="row between"><b>${sc.icon} ${esc(sc.title)}</b><span class="small muted">${new Date(x.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
          <div class="small muted">${x.turns} prises de parole · ${x.words} mots · ${x.mistakes} erreur${x.mistakes > 1 ? 's' : ''}</div>
          ${x.summary ? `<p class="small" style="white-space:pre-line">${esc(x.summary)}</p>` : ''}
        </div>`
      }).join('') : '<p class="muted">Aucune séance pour l\'instant.</p>'}
    </section>`
}
