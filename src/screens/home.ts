import { getState, today, streak } from '../lib/store'
import { dueCards } from '../lib/srs'
import { SCENARIOS } from '../lib/tutor/scenarios'
import { esc, fmtMin, on, navigate } from '../lib/ui'
import { llm } from '../lib/llm/engine'
import { MODELS } from '../lib/llm/models'
import { cloudStatus, cloudUsable } from '../lib/cloud'

export function render(root: HTMLElement) {
  const s = getState()
  const d = today()
  const goalSec = s.settings.dailyGoalMin * 60
  const pct = Math.min(100, Math.round((d.speakingSec / goalSec) * 100))
  const due = dueCards(s.cards).length
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const model = s.settings.llmModel === 'custom' ? 'Modèle personnalisé' : MODELS.find((m) => m.id === s.settings.llmModel)?.label ?? ''
  const onboard = !s.onboarded

  root.innerHTML = `
    ${onboard ? `
    <section class="card">
      <h2>Bienvenue 👋</h2>
      <p>Fluent est un tuteur d'anglais oral qui fonctionne <b>entièrement sur votre appareil</b> : aucune donnée envoyée, aucun abonnement.</p>
      <p class="muted small"><b>Conseil :</b> ajoutez une clé Groq gratuite dans les Réglages pour un tuteur bien plus performant. Sans clé, l'appli télécharge une IA locale (${esc(model)}) qui fonctionne ensuite hors-ligne.</p>
      <div class="row end"><a class="btn" href="#/settings">Réglages IA</a><button class="btn primary" data-go="talk/free">Commencer</button></div>
    </section>` : ''}
    <section class="card hero">
      <div class="ring" style="--p:${pct}"><div>${Math.round(d.speakingSec / 60)}<small>/ ${s.settings.dailyGoalMin} min</small></div></div>
      <div>
        <h1>${hello}!</h1>
        <p class="muted">${pct >= 100 ? 'Objectif du jour atteint. Bravo !' : `Temps de parole aujourd'hui : ${fmtMin(d.speakingSec)} sur ${s.settings.dailyGoalMin} min.`}</p>
        <p class="small muted">🔥 ${streak()} jour${streak() > 1 ? 's' : ''} d'affilée · IA : ${cloudUsable() ? 'Groq (en ligne)' : llm.localReady() ? 'locale, prête' : esc(cloudStatus())}</p>
      </div>
    </section>

    <section class="card">
      <h2>Séance du jour</h2>
      <p class="muted small">La méthode : réactiver vos erreurs passées, parler beaucoup, puis imiter des phrases natives.</p>
      <ol class="plan">
        <li class="${due === 0 && d.reviews > 0 ? 'done' : ''}"><span class="num">1</span>
          <div class="grow"><b>Révisions orales</b><div class="small muted">${due ? `${due} carte${due > 1 ? 's' : ''} à revoir (vos erreurs et expressions)` : 'Rien à revoir pour le moment'}</div></div>
          <button class="btn small" data-go="review" ${due ? '' : 'disabled'}>Go</button></li>
        <li class="${d.speakingSec >= goalSec * 0.6 ? 'done' : ''}"><span class="num">2</span>
          <div class="grow"><b>Conversation (10–15 min)</b><div class="small muted">Corrections après chaque phrase</div></div>
          <button class="btn small primary" data-go="talk">Parler</button></li>
        <li class="${d.shadowCount >= 8 ? 'done' : ''}"><span class="num">3</span>
          <div class="grow"><b>Shadowing (5 min)</b><div class="small muted">${d.shadowCount} / 8 phrases imitées</div></div>
          <button class="btn small" data-go="shadow">Go</button></li>
      </ol>
    </section>

    <section>
      <div class="row between"><h2>Lancer une situation</h2><a class="small muted" href="#/talk">Tout voir →</a></div>
      <div class="chips">
        ${SCENARIOS.map((sc) => `<span class="chip" data-go="talk/${sc.id}">${sc.icon} ${esc(sc.title)}</span>`).join('')}
      </div>
    </section>

    <section class="grid3" style="margin-top:14px">
      <div class="stat"><b>${d.turns}</b><span>prises de parole</span></div>
      <div class="stat"><b>${d.words}</b><span>mots prononcés</span></div>
      <div class="stat"><b>${s.cards.length}</b><span>cartes apprises</span></div>
    </section>
  `
  on(root, 'click', '[data-go]', (el) => navigate('#/' + el.dataset.go))
}
