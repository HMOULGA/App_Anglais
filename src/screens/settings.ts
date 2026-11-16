import { getState, update, exportJson, importJson, type Settings } from '../lib/store'
import { MODELS, WHISPER_MODELS } from '../lib/llm/models'
import { llm, cachedModelUrls, removeCachedModel } from '../lib/llm/engine'
import { listVoices, speak } from '../lib/speech/tts'
import { setLocalModelFile, ensureLLM } from '../lib/ai'
import { isAndroid, multiThread } from '../lib/platform'
import { esc, on, toast } from '../lib/ui'
import { GROQ_MODELS, GEMINI_MODELS, cloudStatus, testCloud, resetCloudPause } from '../lib/cloud'

export function render(root: HTMLElement) {
  let cached: string[] = []
  let voices: Awaited<ReturnType<typeof listVoices>> = []
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => update((s) => { s.settings[k] = v })

  function paint() {
    const st = getState().settings
    root.innerHTML = `
      <h1>Réglages</h1>

      <section class="card">
        <h2>IA en ligne (recommandé)</h2>
        <p class="small muted">Tuteur bien plus intelligent qu'une IA locale, gratuit dans la limite du quota quotidien. Vos phrases sont alors envoyées au fournisseur choisi. Sans réseau ou quota épuisé, l'appli repasse automatiquement sur l'IA locale.</p>
        <div class="field"><label>Fournisseur</label>
          <select data-k="cloudProvider">
            <option value="gemini" ${st.cloudProvider === 'gemini' ? 'selected' : ''}>Google Gemini (clé avec un compte Google)</option>
            <option value="groq" ${st.cloudProvider === 'groq' ? 'selected' : ''}>Groq (conversation + reconnaissance vocale)</option>
          </select></div>
        ${st.cloudProvider === 'gemini' ? `
        <div class="field"><label>Clé API Gemini</label>
          <input type="password" class="cloud-key" data-provider="gemini" placeholder="AIza…" value="${esc(st.geminiKey)}" autocomplete="off" style="padding:.6rem;border-radius:10px;border:1px solid var(--line);background:var(--card)" />
          <span class="small muted">Gratuite : ouvrez <b>aistudio.google.com</b>, connectez-vous avec un compte Google, puis <b>Get API key › Create API key</b>. Collez-la ici. Elle reste sur cet appareil. Au niveau gratuit, Google peut utiliser vos échanges pour améliorer ses produits.</span></div>
        <div class="field"><label>Modèle</label>
          <select data-k="geminiModel">${GEMINI_MODELS.map((m) => `<option value="${m.id}" ${st.geminiModel === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
            ${GEMINI_MODELS.some((m) => m.id === st.geminiModel) ? '' : `<option value="${esc(st.geminiModel)}" selected>${esc(st.geminiModel)}</option>`}</select>
          <input type="text" class="gemini-model-id" placeholder="ou identifiant exact, ex. gemini-3.8-flash" style="padding:.5rem;border-radius:8px;border:1px solid var(--line);background:var(--card)" />
          <span class="small muted">Si Google retire le modèle choisi, l'appli passe d'elle-même au remplaçant qu'il indique.</span></div>
        <p class="small muted">La reconnaissance vocale reste sur l'appareil avec Gemini (moteur Android ou Whisper local).</p>` : `
        <div class="field"><label>Clé API Groq</label>
          <input type="password" class="cloud-key" data-provider="groq" placeholder="gsk_…" value="${esc(st.groqKey)}" autocomplete="off" style="padding:.6rem;border-radius:10px;border:1px solid var(--line);background:var(--card)" />
          <span class="small muted">Gratuite : <b>console.groq.com</b> › API Keys › Create API Key. Elle reste sur cet appareil.</span></div>
        <div class="field"><label>Modèle</label>
          <select data-k="groqModel">${GROQ_MODELS.map((m) => `<option value="${m.id}" ${st.groqModel === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></div>`}
        <label class="switch"><span>Mode privé (hors-ligne)<br><span class="small muted">N'utilise que l'IA locale ; rien n'est envoyé en ligne.</span></span><input type="checkbox" data-k="privateMode" ${st.privateMode ? 'checked' : ''} /></label>
        <div class="row between" style="margin-top:8px"><span class="small muted cloud-status">État : ${esc(cloudStatus())}</span>
          <button class="btn small" data-a="testcloud">Tester la clé</button></div>
      </section>

      <section class="card">
        <h2>Tuteur IA (modèle local, de secours)</h2>
        <p class="small muted">Plus le modèle est gros, meilleures sont les corrections, mais plus il est lent. ${isAndroid ? 'Sur téléphone, Gemma 3 1B est un bon compromis.' : 'Sur PC, Qwen 2.5 3B est recommandé.'}</p>
        ${MODELS.map((m) => `
          <div class="model ${st.llmModel === m.id ? 'sel' : ''}" data-model="${m.id}">
            <input type="radio" name="m" ${st.llmModel === m.id ? 'checked' : ''} />
            <div style="flex:1"><div class="row between"><b>${esc(m.label)}</b>
              ${cached.includes(m.url) ? '<span class="badge">téléchargé</span>' : `<span class="small muted">${m.sizeMB >= 1000 ? (m.sizeMB / 1000).toFixed(1) + ' Go' : m.sizeMB + ' Mo'}</span>`}</div>
              <div class="small muted">${esc(m.note)}</div>
              ${cached.includes(m.url) ? `<button class="btn small ghost" data-rm="${esc(m.url)}">Supprimer du stockage</button>` : ''}</div>
          </div>`).join('')}
        <div class="model ${st.llmModel === 'custom' ? 'sel' : ''}" data-model="custom">
          <input type="radio" name="m" ${st.llmModel === 'custom' ? 'checked' : ''} />
          <div style="flex:1"><b>Autre modèle GGUF (URL)</b>
            <input type="url" class="custom-url" placeholder="https://huggingface.co/…/resolve/main/model-Q4_K_M.gguf" value="${esc(st.customModelUrl)}" style="width:100%;margin-top:6px;padding:.5rem;border-radius:8px;border:1px solid var(--line);background:var(--card)" /></div>
        </div>
        <div class="field"><label>Ou charger un fichier .gguf déjà présent sur l'appareil</label><input type="file" accept=".gguf" class="gguf" /></div>
        <label class="switch"><span>Accélération GPU (WebGPU)<br><span class="small muted">Plus rapide, mais peut produire du texte incohérent sur certains appareils. Désactivez si les réponses sont du charabia.</span></span><input type="checkbox" data-k="gpu" ${st.gpu ? 'checked' : ''} /></label>
        <div class="row between"><span class="small muted">État : ${esc(llm.describe())} · ${multiThread ? 'multi-thread actif' : 'mono-thread'}</span>
          <button class="btn primary small" data-a="load">Télécharger / charger maintenant</button></div>
      </section>

      <section class="card">
        <h2>Voix et écoute</h2>
        <div class="field"><label>Reconnaissance vocale</label>
          <select data-k="sttEngine">
            <option value="cloud" ${st.sttEngine === 'cloud' ? 'selected' : ''}>Groq Whisper large-v3 (en ligne, le plus précis ; Groq uniquement)</option>
            ${isAndroid ? `<option value="native" ${st.sttEngine === 'native' ? 'selected' : ''}>Android (rapide ; installez le pack anglais hors-ligne)</option>` : ''}
            <option value="whisper" ${st.sttEngine === 'whisper' ? 'selected' : ''}>Whisper local (100 % hors-ligne, plus lent)</option>
          </select></div>
        <div class="field"><label>Modèle Whisper</label>
          <select data-k="whisperModel">${WHISPER_MODELS.map((w) => `<option value="${w.id}" ${st.whisperModel === w.id ? 'selected' : ''}>${esc(w.label)}</option>`).join('')}</select></div>
        <div class="field"><label>Accent</label>
          <select data-k="accent"><option value="en-US" ${st.accent === 'en-US' ? 'selected' : ''}>Américain</option><option value="en-GB" ${st.accent === 'en-GB' ? 'selected' : ''}>Britannique</option></select></div>
        <div class="field"><label>Voix du tuteur</label>
          <select data-k="voice"><option value="">Par défaut</option>${voices.map((v) => `<option value="${esc(v.name)}" ${st.voice === v.name ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select>
          ${voices.length ? '' : `<span class="small muted">Aucune voix anglaise trouvée. ${isAndroid ? 'Installez-en une : Paramètres Android › Synthèse vocale.' : 'Windows : Paramètres › Heure et langue › Voix › Ajouter des voix (English).'}</span>`}</div>
        <div class="field"><label>Vitesse de parole : <span class="rate-v">${st.ttsRate.toFixed(2)}</span>×</label>
          <input type="range" min="0.6" max="1.4" step="0.05" value="${st.ttsRate}" data-k="ttsRate" />
          <button class="btn small" data-a="testvoice" style="align-self:flex-start">🔊 Tester la voix</button></div>
      </section>

      <section class="card">
        <h2>Pédagogie</h2>
        <div class="field"><label>Niveau du tuteur</label>
          <select data-k="level">${(['B1', 'B2', 'C1'] as const).map((l) => `<option ${st.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Objectif quotidien (minutes de parole)</label>
          <input type="number" min="5" max="120" step="5" value="${st.dailyGoalMin}" data-k="dailyGoalMin" /></div>
        <div class="field"><label>Moment des corrections</label>
          <select data-k="correctionMode">
            <option value="every" ${st.correctionMode === 'every' ? 'selected' : ''}>Après chaque phrase</option>
            <option value="end" ${st.correctionMode === 'end' ? 'selected' : ''}>En fin de séance (plus fluide)</option></select></div>
        <label class="switch"><span>Explications en français</span><input type="checkbox" data-k="explainInFrench" ${st.explainInFrench ? 'checked' : ''} /></label>
        <label class="switch"><span>Mains libres (écoute automatique)</span><input type="checkbox" data-k="handsFree" ${st.handsFree ? 'checked' : ''} /></label>
      </section>

      <section class="card">
        <h2>Données</h2>
        <p class="small muted">Tout est stocké sur cet appareil. Exportez pour transférer vos progrès entre téléphone et PC.</p>
        <div class="row"><button class="btn" data-a="export">Exporter</button>
          <label class="btn">Importer<input type="file" accept=".json" class="imp" hidden /></label>
          <button class="btn ghost" data-a="reset">Tout effacer</button></div>
      </section>
      <p class="small muted" style="text-align:center">Fluent 0.1 · IA : llama.cpp (wllama) + Whisper · aucune donnée envoyée</p>`
  }

  paint()
  void (async () => {
    voices = await listVoices().catch(() => [])
    cached = await cachedModelUrls()
    if (root.isConnected) paint()
  })()

  on(root, 'click', '[data-model]', (el, e) => {
    if ((e.target as HTMLElement).closest('[data-rm], input[type=url]')) return
    setLocalModelFile(null)
    set('llmModel', el.dataset.model!)
    void paint()
  })
  on(root, 'click', '[data-rm]', async (el) => {
    if (!confirm('Supprimer ce modèle du stockage ?')) return
    await removeCachedModel(el.dataset.rm!)
    cached = await cachedModelUrls()
    void paint()
  })
  root.addEventListener('change', async (e) => {
    const t = e.target as HTMLInputElement
    if (t.classList.contains('gemini-model-id') && t.value.trim()) {
      set('geminiModel', t.value.trim().replace(/^models\//, ''))
      resetCloudPause()
      paint()
      return
    }
    if (t.classList.contains('cloud-key')) {
      saveKey(t)
      paint()
      return
    }
    if (t.classList.contains('custom-url')) { set('customModelUrl', t.value); set('llmModel', 'custom'); return }
    if (t.classList.contains('gguf') && t.files?.[0]) {
      setLocalModelFile(t.files[0])
      if (await ensureLLM()) toast('Modèle local chargé')
      return
    }
    if (t.classList.contains('imp') && t.files?.[0]) {
      try { importJson(await t.files[0].text()); toast('Progrès importés'); void paint() } catch (err) { toast((err as Error).message) }
      return
    }
    const k = t.dataset.k as keyof Settings | undefined
    if (!k) return
    const v = t.type === 'checkbox' ? t.checked : t.type === 'range' || t.type === 'number' ? Number(t.value) : t.value
    set(k, v as never)
    if (k === 'privateMode' || k === 'groqModel' || k === 'geminiModel' || k === 'cloudProvider') { resetCloudPause(); paint() }
  })
  function saveKey(t: HTMLInputElement) {
    const v = t.value.trim()
    if (t.dataset.provider === 'gemini') set('geminiKey', v)
    else {
      const first = !getState().settings.groqKey && v
      set('groqKey', v)
      if (first) set('sttEngine', 'cloud') // première clé Groq : on active aussi la transcription en ligne
    }
    resetCloudPause()
  }

  root.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement
    if (t.classList.contains('cloud-key')) { saveKey(t); return }
    if (t.dataset.k === 'ttsRate') root.querySelector('.rate-v')!.textContent = Number(t.value).toFixed(2)
  })
  on(root, 'click', '[data-a]', async (el) => {
    const a = el.dataset.a
    const st = getState().settings
    if (a === 'testcloud') {
      const out = root.querySelector<HTMLElement>('.cloud-status')!
      const field = root.querySelector<HTMLInputElement>('.cloud-key')
      if (field) saveKey(field)
      if (!field?.value.trim()) { out.textContent = '✗ Collez d’abord votre clé dans le champ ci-dessus.'; return }
      if (getState().settings.privateMode) { out.textContent = '✗ Désactivez le mode privé pour tester la clé.'; return }
      out.textContent = 'Test en cours…'
      try { out.textContent = `✓ Groq répond : ${await testCloud()}` } catch (e) { out.textContent = `✗ ${(e as Error).message}` }
      return
    }
    if (a === 'load') { if (await ensureLLM()) { toast('Modèle prêt'); cached = await cachedModelUrls(); void paint() } }
    else if (a === 'testvoice') void speak("Hi! I'm Emma, your English partner. Let's practise together.", { rate: st.ttsRate, voice: st.voice, lang: st.accent })
    else if (a === 'export') {
      const blob = new Blob([exportJson()], { type: 'application/json' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `fluent-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
    } else if (a === 'reset') {
      if (confirm('Effacer tous vos progrès, cartes et réglages ?')) { localStorage.clear(); location.reload() }
    }
  })
}
