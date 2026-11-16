// Conversation orale avec le tuteur : écoute → réponse parlée → correction de chaque phrase.
import { SCENARIOS, scenarioById, type Scenario } from '../lib/tutor/scenarios'
import {
  tutorMessages, correctionMessages, summaryMessages, CORRECTION_SCHEMA, SUMMARY_SCHEMA,
  type Correction, type Summary, TUTOR_NAME,
} from '../lib/tutor/prompts'
import { fluency, normalize, compareWords } from '../lib/tutor/analysis'
import { llm, parseJson, type ChatMsg } from '../lib/llm/engine'
import { listen, type ListenHandle } from '../lib/speech/stt'
import { speak, stopSpeaking } from '../lib/speech/tts'
import { ensureAll } from '../lib/ai'
import { getState, update, bumpToday } from '../lib/store'
import { newCard } from '../lib/srs'
import { esc, on, modal, navigate, toast } from '../lib/ui'

export function render(root: HTMLElement, params: string[]) {
  if (!params[0]) return renderPicker(root)
  return renderConvo(root, scenarioById(params[0]))
}

function renderPicker(root: HTMLElement) {
  root.innerHTML = `
    <h1>Choisir une situation</h1>
    <p class="muted">Le tuteur joue un rôle et vous pose des questions. Parlez le plus possible : c'est le temps de parole qui fait progresser.</p>
    <div class="list-grid">
      ${SCENARIOS.map((s) => `
        <div class="card scen" data-id="${s.id}">
          <div class="ico">${s.icon}</div>
          <div><h3>${esc(s.title)}</h3><p class="small muted">${esc(s.goal)}</p></div>
        </div>`).join('')}
    </div>`
  on(root, 'click', '.scen', (el) => navigate('#/talk/' + el.dataset.id))
}

interface Turn { said: string; corrected?: string; fix: HTMLElement; context: string }

function renderConvo(root: HTMLElement, sc: Scenario) {
  const st = getState().settings
  let alive = true
  let handsFree = st.handsFree
  let handle: ListenHandle | null = null
  let listening = false
  let replying = false
  let started = false
  let ended = false
  const history: ChatMsg[] = []
  const turns: Turn[] = []
  const stats = { words: 0, sec: 0, mistakes: 0 }
  const corrQueue: Turn[] = []
  let corrRunning: { t: Turn; ctrl: AbortController } | null = null

  root.innerHTML = `
    <div class="convo-head">
      <div><b>${sc.icon} ${esc(sc.title)}</b><div class="small muted">${esc(sc.goal)}</div></div>
      <button class="btn small" data-act="end">Terminer</button>
    </div>
    <div class="msgs"></div>
    <div class="dock"><div class="dock-inner">
      <div class="side-btns">
        <button class="btn small" data-act="hands" title="Écoute automatique après chaque réponse">${handsFree ? '🔄 Auto' : '✋ Manuel'}</button>
        <button class="btn small" data-act="kbd" title="Écrire au lieu de parler">⌨ Écrire</button>
      </div>
      <div class="status">Appuyez sur le micro pour commencer.</div>
      <button class="mic" aria-label="Parler">🎙</button>
    </div>
    <div class="textbox" hidden style="max-width:760px;margin:8px auto 0">
      <input type="text" placeholder="Type your answer…" autocomplete="off" /><button class="btn primary" data-act="send">Envoyer</button>
    </div></div>`

  const msgs = root.querySelector<HTMLElement>('.msgs')!
  const statusEl = root.querySelector<HTMLElement>('.status')!
  const mic = root.querySelector<HTMLButtonElement>('.mic')!
  const textbox = root.querySelector<HTMLElement>('.textbox')!
  const input = textbox.querySelector('input')!

  const status = (html: string) => { statusEl.innerHTML = html }
  const scrollDown = () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  const setMic = (mode: 'idle' | 'listening' | 'busy') => {
    mic.classList.toggle('listening', mode === 'listening')
    mic.classList.toggle('busy', mode === 'busy')
    mic.textContent = mode === 'listening' ? '■' : '🎙'
    if (mode !== 'listening') mic.style.setProperty('--lvl', '0')
  }

  function addTutor(text: string): HTMLElement {
    const el = document.createElement('div')
    el.className = 'msg tutor'
    el.innerHTML = `<span class="txt">${esc(text)}</span><button class="replay" title="Réécouter">🔊</button>`
    msgs.appendChild(el)
    scrollDown()
    return el
  }

  async function tutorSpeak(text: string) {
    status(`${TUTOR_NAME} parle… <span class="small">(touchez le micro pour l'interrompre)</span>`)
    await speak(text, { rate: st.ttsRate, voice: st.voice, lang: st.accent })
    if (!alive) return
    if (handsFree && !listening && !replying) void startListening()
    else if (!listening) status('À vous ! Appuyez sur le micro.')
  }

  async function start() {
    if (started) return true
    status('Préparation de l\'IA…')
    setMic('busy')
    if (!(await ensureAll())) { setMic('idle'); status('IA non disponible. Vérifiez les Réglages.'); return false }
    if (!alive) return false
    started = true
    setMic('idle')
    history.push({ role: 'assistant', content: sc.opener })
    addTutor(sc.opener)
    void tutorSpeak(sc.opener)
    return true
  }

  async function startListening() {
    if (listening || !alive) return
    await stopSpeaking()
    listening = true
    setMic('listening')
    status('Je vous écoute… <span class="small">(pause = fin de phrase)</span>')
    try {
      handle = await listen({
        engine: st.sttEngine,
        accent: st.accent,
        autoStop: true,
        onLevel: (lvl) => mic.style.setProperty('--lvl', lvl.toFixed(2)),
        onPartial: (t) => status(`<span class="partial">${esc(t)}</span>`),
        onTranscribing: () => { setMic('busy'); status('Transcription…') },
      })
      const r = await handle.result
      listening = false
      handle = null
      setMic('idle')
      if (!alive) return
      if (!r.text) { status('Je n\'ai rien entendu. Appuyez sur le micro et parlez.'); return }
      await onUserText(r.text, r.speechSec)
    } catch (e) {
      listening = false
      handle = null
      setMic('idle')
      if ((e as Error).name !== 'AbortError') status(`Micro indisponible : ${esc((e as Error).message)}`)
    }
  }

  async function onUserText(text: string, speechSec: number) {
    const f = fluency(text, speechSec)
    const me = document.createElement('div')
    me.className = 'msg me'
    me.innerHTML = `${esc(text)}${f.wpm ? `<div class="meta">${f.words} mots · ${f.wpm} mots/min</div>` : ''}`
    msgs.appendChild(me)
    const fix = document.createElement('div')
    fix.className = 'fix'
    fix.innerHTML = '<span class="pending">Correction en attente…</span>'
    if (st.correctionMode === 'end') fix.hidden = true
    msgs.appendChild(fix)
    scrollDown()

    stats.words += f.words
    stats.sec += speechSec
    bumpToday({ speakingSec: speechSec, words: f.words, turns: 1 })

    const context = [...history].reverse().find((m) => m.role === 'assistant')?.content ?? ''
    history.push({ role: 'user', content: text })
    const turn: Turn = { said: text, fix, context }
    turns.push(turn)

    // 1) réponse du tuteur en priorité (on suspend la correction en cours)
    replying = true
    corrRunning?.ctrl.abort()
    setMic('busy')
    status(`${TUTOR_NAME} réfléchit…`)
    const bubble = addTutor('')
    const txt = bubble.querySelector('.txt')!
    txt.classList.add('typing')
    let reply = ''
    try {
      reply = cleanReply(await llm.chat(tutorMessages(sc, st.level, history), {
        maxTokens: 110, temperature: 0.8,
        onToken: (t) => { txt.textContent = cleanReply(t); scrollDown() },
      }))
    } catch (e) {
      reply = "Sorry, I lost my train of thought. Could you say that again?"
      console.error(e)
    }
    txt.classList.remove('typing')
    txt.textContent = reply
    history.push({ role: 'assistant', content: reply })
    replying = false
    setMic('idle')
    if (!alive) return

    // 2) correction en arrière-plan pendant que le tuteur parle
    corrQueue.push(turn)
    pumpCorrections()
    await tutorSpeak(reply)
  }

  function pumpCorrections() {
    if (corrRunning || replying || !corrQueue.length || !alive) return
    const t = corrQueue.shift()!
    const ctrl = new AbortController()
    corrRunning = { t, ctrl }
    t.fix.innerHTML = '<span class="pending">Analyse de votre phrase…</span>'
    llm.chat(correctionMessages(t.said, t.context, st.level, st.explainInFrench), {
      jsonSchema: CORRECTION_SCHEMA, temperature: 0.1, maxTokens: 220, signal: ctrl.signal,
    })
      .then((raw) => showCorrection(t, parseJson<Correction>(raw)))
      .catch(() => {
        if (ctrl.signal.aborted) { corrQueue.unshift(t); t.fix.innerHTML = '<span class="pending">Correction en attente…</span>' }
        else t.fix.innerHTML = '<span class="pending">Correction indisponible.</span>'
      })
      .finally(() => { corrRunning = null; pumpCorrections() })
  }

  function showCorrection(t: Turn, c: Correction | null) {
    if (!c) { t.fix.innerHTML = '<span class="pending">Correction illisible (modèle trop petit ?).</span>'; return }
    const changed = !!c.corrected && normalize(c.corrected) !== normalize(t.said)
    const wrong = !c.ok && changed
    t.corrected = wrong ? c.corrected : t.said
    const better = c.better && normalize(c.better) !== normalize(t.corrected) ? c.better : ''
    const exprs = (c.expressions ?? []).filter((x) => x?.phrase)
    t.fix.className = `fix ${wrong ? 'bad' : better || exprs.length ? '' : 'ok'}`
    t.fix.innerHTML = `
      ${wrong
        ? `<div class="lbl">Correction</div><div class="corr">${esc(c.corrected)}</div>${c.explanation ? `<div class="small">${esc(c.explanation)}</div>` : ''}`
        : '<div>✓ Correct</div>'}
      ${better ? `<div class="lbl">Plus naturel</div><div>${esc(better)}</div>` : ''}
      ${exprs.length ? `<div class="lbl">Expressions utiles</div>${exprs.map((x) => `<span class="expr" title="${esc(x.meaning)}">${esc(x.phrase)} — <i>${esc(x.meaning)}</i></span>`).join('')}` : ''}
      ${wrong || better ? `<div class="row end" style="margin-top:6px"><button class="btn small" data-act="redo">🎙 Redire correctement</button></div><div class="redo-res small"></div>` : ''}`
    ;(t.fix as any)._target = better || c.corrected

    // carnet : erreurs et expressions → cartes de révision
    update((s) => {
      if (wrong) s.cards.push(newCard('mistake', t.said, c.corrected, c.explanation))
      for (const x of exprs) {
        if (!s.cards.some((k) => k.kind === 'expression' && normalize(k.back) === normalize(x.phrase))) {
          s.cards.push(newCard('expression', x.meaning, x.phrase, `Contexte : « ${t.said} »`))
        }
      }
    })
    if (wrong) { stats.mistakes++; bumpToday({ mistakes: 1 }) }
  }

  async function redo(fix: HTMLElement) {
    const target: string = (fix as any)._target
    const out = fix.querySelector<HTMLElement>('.redo-res')!
    if (listening) return
    await stopSpeaking()
    listening = true
    setMic('listening')
    out.textContent = 'Je vous écoute…'
    try {
      handle = await listen({ engine: st.sttEngine, accent: st.accent, autoStop: true,
        onLevel: (l) => mic.style.setProperty('--lvl', l.toFixed(2)),
        onTranscribing: () => { out.textContent = 'Transcription…' } })
      const r = await handle.result
      const { diff, score } = compareWords(target, r.text)
      out.innerHTML = `<div class="diff">${diff.map((d) => `<span class="${d.status}">${esc(d.word)}</span>`).join('')}</div><b>${score} %</b> ${score >= 85 ? '— parfait !' : '— réessayez'}`
    } catch { out.textContent = '' } finally { listening = false; handle = null; setMic('idle') }
  }

  async function end() {
    if (ended) return
    ended = true
    alive = false
    handle?.cancel()
    await stopSpeaking()
    if (!turns.length) { navigate('#/talk'); return }
    // on laisse finir les corrections
    alive = true
    let closeWait: (() => void) | null = null
    if (corrQueue.length || corrRunning) {
      closeWait = modal('<h2>Bilan de la séance</h2><p class="muted">Finalisation des corrections…</p><div class="bar"><div class="fill" style="width:60%"></div></div>')
      pumpCorrections()
      while ((corrQueue.length || corrRunning) && alive) await new Promise((r) => setTimeout(r, 300))
    }
    turns.forEach((t) => { t.fix.hidden = false })
    let summary: Summary | null = null
    try {
      summary = parseJson<Summary>(await llm.chat(summaryMessages(turns, st.explainInFrench), { jsonSchema: SUMMARY_SCHEMA, temperature: 0.3, maxTokens: 260 }))
    } catch { /* bilan sans texte */ }
    closeWait?.()
    alive = false
    const wpm = stats.sec > 3 ? Math.round((stats.words / stats.sec) * 60) : 0
    const accuracy = turns.length ? Math.round(100 * (1 - stats.mistakes / turns.length)) : 0
    const summaryText = summary ? `${summary.strengths}\nÀ travailler : ${summary.focus.join(' ; ')}\nConseil : ${summary.tip}` : ''
    update((s) => {
      s.sessions.unshift({ id: Date.now().toString(36), date: Date.now(), scenario: sc.id, turns: turns.length, words: stats.words, speakingSec: Math.round(stats.sec), mistakes: stats.mistakes, summary: summaryText })
      s.sessions = s.sessions.slice(0, 100)
      s.onboarded = true
    })
    modal(`
      <h2>Bilan — ${esc(sc.title)}</h2>
      <div class="grid3" style="margin:10px 0">
        <div class="stat"><b>${turns.length}</b><span>prises de parole</span></div>
        <div class="stat"><b>${wpm || '—'}</b><span>mots / min</span></div>
        <div class="stat"><b>${accuracy} %</b><span>phrases correctes</span></div>
      </div>
      ${summary ? `
        <p>💪 ${esc(summary.strengths)}</p>
        ${summary.focus.length ? `<h3>À travailler</h3><ul class="tight">${summary.focus.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <p>🎯 <b>Prochaine fois :</b> ${esc(summary.tip)}</p>` : ''}
      <p class="small muted">Vos erreurs et les expressions proposées ont été ajoutées à la Révision.</p>
      <div class="row end"><button class="btn" data-x="stay">Revoir la conversation</button><button class="btn primary" data-x="home">Terminer</button></div>`,
    (m, close) => {
      m.querySelector('[data-x=stay]')!.addEventListener('click', close)
      m.querySelector('[data-x=home]')!.addEventListener('click', () => { close(); navigate('#/') })
    })
    status('Séance terminée.')
    setMic('busy')
  }

  on(root, 'click', '.mic', () => {
    if (ended) return
    if (!started) { void start(); return }
    if (listening) { handle?.stop(); return }
    if (replying) { toast(`${TUTOR_NAME} prépare sa réponse…`); return }
    void startListening()
  })
  on(root, 'click', '.replay', (el) => {
    const t = el.parentElement!.querySelector('.txt')!.textContent ?? ''
    void speak(t, { rate: st.ttsRate * 0.85, voice: st.voice, lang: st.accent })
  })
  on(root, 'click', '[data-act]', (el) => {
    const a = el.dataset.act
    if (a === 'end') void end()
    else if (a === 'hands') { handsFree = !handsFree; el.textContent = handsFree ? '🔄 Auto' : '✋ Manuel' }
    else if (a === 'kbd') { textbox.hidden = !textbox.hidden; if (!textbox.hidden) input.focus() }
    else if (a === 'send') sendTyped()
    else if (a === 'redo') void redo(el.closest('.fix') as HTMLElement)
  })
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendTyped() })
  function sendTyped() {
    const t = input.value.trim()
    if (!t || replying || ended) return
    input.value = ''
    void (async () => { if (await start()) { await stopSpeaking(); await onUserText(t, 0) } })()
  }

  void start()

  return () => {
    alive = false
    handle?.cancel()
    corrRunning?.ctrl.abort()
    void stopSpeaking()
    if (!ended && turns.length) {
      update((s) => {
        s.sessions.unshift({ id: Date.now().toString(36), date: Date.now(), scenario: sc.id, turns: turns.length, words: stats.words, speakingSec: Math.round(stats.sec), mistakes: stats.mistakes, summary: '' })
        s.onboarded = true
      })
    }
  }
}

/** Retire ce que les petits modèles ajoutent parfois (nom du locuteur, guillemets, didascalies). */
export function cleanReply(t: string): string {
  return t
    .replace(/^\s*(emma|tutor|assistant)\s*:\s*/i, '')
    .replace(/\*[^*]*\*|\([^)]*\)/g, '')
    .replace(/^["“]|["”]$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
