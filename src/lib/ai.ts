// Préparation des moteurs IA (chargement du modèle de langage et de Whisper) avec écran de progression.
import { llm } from './llm/engine'
import { MODELS, modelUrl } from './llm/models'
import { loadWhisper, whisperIsLoaded } from './speech/stt'
import { getState } from './store'
import { esc, modal } from './ui'
import { isAndroid } from './platform'
import { cloudUsable } from './cloud'

let localFile: File | null = null
export function setLocalModelFile(f: File | null) { localFile = f }

function progressModal(title: string) {
  let el!: HTMLElement
  const close = modal(
    `<h2>${esc(title)}</h2><p class="muted phase">Préparation…</p>
     <div class="bar"><div class="fill" style="width:0%"></div></div>
     <p class="muted small pct"></p>`,
    (m) => { el = m },
  )
  return {
    set(p: number, phase: string, detail = '') {
      el.querySelector<HTMLElement>('.fill')!.style.width = `${Math.round(p * 100)}%`
      el.querySelector<HTMLElement>('.phase')!.textContent = phase
      el.querySelector<HTMLElement>('.pct')!.textContent = detail || `${Math.round(p * 100)} %`
    },
    close,
  }
}

/** Prépare le tuteur : Groq si disponible, sinon charge le modèle local. Renvoie false en cas d'échec. */
export async function ensureLLM(forceLocal = false): Promise<boolean> {
  if (!forceLocal && cloudUsable()) return true
  const s = getState().settings
  const src: string | File = localFile ?? modelUrl(s.llmModel, s.customModelUrl)
  if (!src) { alertBox('Aucun modèle', 'Choisissez un modèle dans les Réglages.'); return false }
  const info = MODELS.find((m) => m.id === s.llmModel)
  const ui = progressModal('Préparation du tuteur IA')
  try {
    await llm.load(src, (p, phase) =>
      ui.set(p, phase, info && phase.startsWith('Télé') ? `${Math.round(p * info.sizeMB)} / ${info.sizeMB} Mo` : ''),
    { gpu: s.gpu })
    ui.close()
    return true
  } catch (e) {
    ui.close()
    alertBox('Impossible de charger le modèle', `${(e as Error).message}<br><br>Vérifiez la connexion pour le premier téléchargement, ou choisissez un modèle plus léger dans les Réglages.`)
    return false
  }
}

export async function ensureWhisper(): Promise<boolean> {
  const s = getState().settings
  if (s.sttEngine === 'native' && isAndroid) return true
  if (s.sttEngine === 'cloud' && (cloudUsable() || isAndroid)) return true // Android : repli sur la reconnaissance native
  if (whisperIsLoaded(s.whisperModel)) return true
  const ui = progressModal('Préparation de la reconnaissance vocale')
  try {
    await loadWhisper(s.whisperModel, (p) => ui.set(p, 'Téléchargement de Whisper'))
    ui.close()
    return true
  } catch (e) {
    ui.close()
    alertBox('Reconnaissance vocale indisponible', esc((e as Error).message))
    return false
  }
}

export async function ensureAll(): Promise<boolean> {
  return (await ensureLLM()) && (await ensureWhisper())
}

export function alertBox(title: string, html: string) {
  modal(`<h2>${esc(title)}</h2><p>${html}</p><div class="row end"><button class="btn primary" data-close>OK</button></div>`,
    (m, close) => m.querySelector('[data-close]')!.addEventListener('click', close))
}
